// OpsScroll — an endless, snap-scrolling feed of DevOps content you control.
// Sources: your own picks, the dev.to public API and Hacker News (Algolia). No keys, no backend.
// What goes in the feed is defined in config.js and can be tweaked per device in ⚙ Settings.
(() => {
  "use strict";

  const PAGE_SIZE = 12;
  const SAVED_KEY = "opsscroll:saved";
  const SETTINGS_KEY = "opsscroll:settings";
  const ALL = { id: "all", label: "All" };

  const $ = (sel, root = document) => root.querySelector(sel);
  const feed = $("#feed");
  const chipsEl = $("#chips");
  const tpl = $("#cardTpl");
  const savedToggle = $("#savedToggle");
  const savedCountEl = $("#savedCount");

  // ---------- storage helpers (per-device; may be unavailable) ----------
  const readStore = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
  };
  const writeStore = (key, value) => {
    try { value === undefined ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch {}
  };

  // ---------- settings: config.js defaults, overridden by this device's saved settings ----------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const slug = (s) => String(s ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const tagList = (v) => (Array.isArray(v) ? v : String(v || "").split(",")).map(slug).filter(Boolean);
  const isHttpUrl = (u) => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };

  function normalize(raw) {
    const d = raw && typeof raw === "object" ? raw : {};
    const ids = new Set();
    const topics = (Array.isArray(d.topics) ? d.topics : []).filter((t) => t && t.label).map((t) => {
      let id = slug(t.id || t.label) || "topic";
      while (ids.has(id) || id === ALL.id) id += "-2";
      ids.add(id);
      return { id, label: String(t.label), devto: String(t.devto || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
        hn: String(t.hn || "").trim(), enabled: t.enabled !== false };
    });
    return {
      sources: { devto: d.sources?.devto !== false, hn: d.sources?.hn !== false, picks: d.sources?.picks !== false },
      hnMinPoints: Math.max(0, parseInt(d.hnMinPoints, 10) || 0),
      topics,
      muteWords: (Array.isArray(d.muteWords) ? d.muteWords : []).map((w) => String(w).trim()).filter(Boolean),
      picks: (Array.isArray(d.picks) ? d.picks : []).filter((p) => p && p.title && isHttpUrl(p.url)).map((p) => ({
        title: String(p.title), url: String(p.url), note: String(p.note || ""),
        tags: tagList(p.tags),
      })),
    };
  }

  const DEFAULTS = normalize(window.OPSSCROLL_DEFAULTS || {});
  let settings = normalize(readStore(SETTINGS_KEY, null) || DEFAULTS);
  const enabledTopics = () => settings.topics.filter((t) => t.enabled);

  // ---------- feed state ----------
  const state = {
    topic: ALL,
    page: 1,
    emptyStreak: 0,
    loading: false,
    exhausted: false,
    seen: new Set(),
    showingSaved: false,
    generation: 0, // bumps on reset so stale responses are dropped
  };

  // ---------- saved posts ----------
  let saved = readStore(SAVED_KEY, []);
  if (!Array.isArray(saved)) saved = [];
  const persistSaved = () => { writeStore(SAVED_KEY, saved); savedCountEl.textContent = saved.length; };
  const isSaved = (id) => saved.some((p) => p.id === id);
  const toggleSave = (post) => {
    saved = isSaved(post.id) ? saved.filter((p) => p.id !== post.id) : [post, ...saved];
    persistSaved();
  };

  // ---------- sources ----------
  async function getJSON(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }

  async function fetchDevto(tag, page) {
    const url = `https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&per_page=${PAGE_SIZE}&page=${page}&top=30`;
    const items = await getJSON(url);
    return items.map((a) => ({
      id: `devto:${a.id}`,
      source: "devto",
      title: a.title,
      desc: a.description || "",
      url: a.url,
      discuss: `${a.url}#comments`,
      cover: a.cover_image || a.social_image || null,
      tags: a.tag_list || [],
      author: a.user?.name || a.user?.username || "",
      score: a.public_reactions_count ?? 0,
      comments: a.comments_count ?? 0,
      readMins: a.reading_time_minutes,
      time: Date.parse(a.published_at),
    }));
  }

  async function fetchHN(query, page) {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}` +
      `&tags=story&hitsPerPage=${PAGE_SIZE}&page=${page - 1}&numericFilters=points>=${settings.hnMinPoints}`;
    const data = await getJSON(url);
    return data.hits.filter((h) => h.title).map((h) => {
      const discuss = `https://news.ycombinator.com/item?id=${h.objectID}`;
      let host = "";
      try { host = h.url ? new URL(h.url).hostname.replace(/^www\./, "") : ""; } catch {}
      return {
        id: `hn:${h.objectID}`,
        source: "hn",
        title: h.title,
        desc: host ? `via ${host}` : "Discussion on Hacker News",
        url: h.url || discuss,
        discuss,
        cover: null,
        tags: [query.toLowerCase()],
        author: h.author,
        score: h.points ?? 0,
        comments: h.num_comments ?? 0,
        time: (h.created_at_i || 0) * 1000,
      };
    });
  }

  function picksFor(topic) {
    if (!settings.sources.picks) return [];
    return settings.picks
      .filter((p) => topic.id === ALL.id || p.tags.includes(topic.id))
      .map((p) => ({
        id: `pick:${p.url}`,
        source: "pick",
        title: p.title,
        note: p.note,
        desc: (() => { try { return `via ${new URL(p.url).hostname.replace(/^www\./, "")}`; } catch { return ""; } })(),
        url: p.url,
        discuss: null,
        tags: p.tags,
      }));
  }

  const isMuted = (post) => {
    if (!settings.muteWords.length) return false;
    const hay = `${post.title} ${post.desc} ${post.note || ""} ${(post.tags || []).join(" ")}`.toLowerCase();
    return settings.muteWords.some((w) => hay.includes(w.toLowerCase()));
  };

  function interleave(a, b) {
    const out = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i]) out.push(a[i]);
      if (b[i]) out.push(b[i]);
    }
    return out;
  }

  // Which topic and sub-page to fetch next. "All" cycles through every enabled topic.
  function nextQuery() {
    if (state.topic.id !== ALL.id) return { topic: state.topic, page: state.page, cycle: 1 };
    const list = enabledTopics();
    if (!list.length) return null;
    const i = state.page - 1;
    return { topic: list[i % list.length], page: Math.floor(i / list.length) + 1, cycle: list.length };
  }

  function addPosts(posts) {
    const fresh = posts.filter((p) => {
      if (state.seen.has(p.url) || isMuted(p)) return false;
      state.seen.add(p.url);
      return true;
    });
    // If the reader is parked on the loading placeholder, move them to the first new post;
    // otherwise Chrome re-snaps to the placeholder and drags them to the end of the feed.
    const parkedOnStatus = feed.scrollTop + feed.clientHeight / 2 > statusEl.offsetTop;
    const nodes = fresh.map(renderCard);
    nodes.forEach((n) => feed.insertBefore(n, statusEl));
    if (parkedOnStatus && nodes[0]) nodes[0].scrollIntoView({ block: "start" });
    return fresh.length;
  }

  async function loadMore() {
    if (state.loading || state.exhausted || state.showingSaved) return;
    const gen = state.generation;

    if (state.page === 1) addPosts(picksFor(state.topic));

    const q = nextQuery();
    const useDev = settings.sources.devto && q?.topic.devto;
    const useHN = settings.sources.hn && q?.topic.hn;
    if (!q || (!settings.sources.devto && !settings.sources.hn)) {
      state.exhausted = true;
      return setStatus(feed.querySelector(".card") ? "end" : "nothing");
    }

    state.loading = true;
    setStatus("loading");
    const [dev, hn] = await Promise.allSettled([
      useDev ? fetchDevto(q.topic.devto, q.page) : Promise.resolve([]),
      useHN ? fetchHN(q.topic.hn, q.page) : Promise.resolve([]),
    ]);
    if (gen !== state.generation) return; // feed was reset mid-flight
    state.loading = false;

    if ((!useDev || dev.status === "rejected") && (!useHN || hn.status === "rejected") && (useDev || useHN)) {
      return setStatus("error");
    }
    const devItems = dev.status === "fulfilled" ? dev.value : [];
    const hnItems = hn.status === "fulfilled" ? hn.value : [];
    state.page += 1;

    // A topic can run dry while others in "All" still have posts; stop once a full cycle is empty.
    state.emptyStreak = devItems.length || hnItems.length ? 0 : state.emptyStreak + 1;
    if (state.emptyStreak >= q.cycle) {
      state.exhausted = true;
      return setStatus(feed.querySelector(".card") ? "end" : "nothing");
    }
    addPosts(interleave(devItems, hnItems));
    setStatus("idle");
    maybeLoadMore(); // keep the buffer full (also covers dedupe/mute filtering out a whole page)
  }

  // ---------- rendering ----------
  function timeAgo(ms) {
    if (!ms) return "";
    const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
    const units = [["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]];
    for (const [u, n] of units) if (s >= n) return `${Math.floor(s / n)}${u} ago`;
    return `${s}s ago`;
  }

  const SOURCE_LABEL = { hn: "Hacker News", devto: "DEV", pick: "★ My pick" };

  function renderCard(post) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = post.id;
    node._post = post;

    const src = $(".source", node);
    src.textContent = SOURCE_LABEL[post.source] || post.source;
    src.classList.add(post.source);
    const age = [timeAgo(post.time), post.author && `by ${post.author}`].filter(Boolean).join(" · ");
    $(".age", node).textContent = age;
    if (!age) $(".dot", node).hidden = true;

    const note = $(".note", node);
    if (post.note) { note.textContent = post.note; note.hidden = false; }

    const img = $(".cover", node);
    if (post.cover && /^https:\/\//.test(post.cover)) {
      img.src = post.cover;
      img.onerror = () => { img.hidden = true; };
    } else {
      img.hidden = true;
    }

    $(".title", node).textContent = post.title;
    $(".desc", node).textContent = post.desc;

    const tags = $(".tags", node);
    [...new Set(post.tags || [])].slice(0, 5).forEach((t) => {
      const li = document.createElement("li");
      li.textContent = `#${t}`;
      tags.appendChild(li);
    });

    const stats = $(".stats", node);
    if (post.source === "pick") {
      stats.hidden = true;
    } else {
      const bits = [`▲ ${post.score}`, `💬 ${post.comments}`];
      if (post.readMins) bits.push(`${post.readMins} min read`);
      stats.textContent = bits.join("  ·  ");
    }

    const safe = (u) => (isHttpUrl(u) ? u : "#");
    $(".open", node).href = safe(post.url);
    const discuss = $(".discuss", node);
    if (post.discuss) discuss.href = safe(post.discuss); else discuss.remove();

    const saveBtn = $(".save", node);
    const syncSave = () => {
      const on = isSaved(post.id);
      saveBtn.textContent = on ? "★ Saved" : "☆ Save";
      saveBtn.classList.toggle("saved", on);
    };
    saveBtn.addEventListener("click", () => { toggleSave(post); syncSave(); });
    syncSave();
    return node;
  }

  const statusEl = document.createElement("div");
  statusEl.className = "status";
  function setStatus(kind) {
    const msg = {
      loading: '<div><div class="spinner"></div>Fetching more ops content…</div>',
      error: '<div>Couldn\'t reach the feeds.<br><br><button class="btn primary" type="button" data-act="retry">Retry</button></div>',
      end: "<div>You've hit the bottom. Go touch grass (or pick another topic).</div>",
      nothing: '<div>Nothing to show with your current settings.<br><br><button class="btn primary" type="button" data-act="settings">Choose content</button></div>',
      "saved-empty": "<div>Nothing saved yet. Press <b>s</b> or tap ☆ on a post.</div>",
      idle: '<div><div class="spinner"></div></div>',
    }[kind];
    statusEl.innerHTML = msg;
    $("[data-act=retry]", statusEl)?.addEventListener("click", () => loadMore());
    $("[data-act=settings]", statusEl)?.addEventListener("click", () => openSettings());
  }

  function resetFeed() {
    state.generation += 1;
    Object.assign(state, { page: 1, emptyStreak: 0, loading: false, exhausted: false });
    state.seen.clear();
    feed.replaceChildren(statusEl);
    feed.scrollTop = 0;
  }

  function renderChips() {
    chipsEl.replaceChildren();
    [ALL, ...enabledTopics()].forEach((t) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.dataset.id = t.id;
      b.textContent = t.label;
      b.onclick = () => selectTopic(t);
      chipsEl.appendChild(b);
    });
  }

  function selectTopic(topic) {
    state.topic = topic;
    state.showingSaved = false;
    savedToggle.setAttribute("aria-pressed", "false");
    chipsEl.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.id === topic.id)));
    resetFeed();
    loadMore();
  }

  function showSaved(on) {
    state.showingSaved = on;
    savedToggle.setAttribute("aria-pressed", String(on));
    if (!on) return selectTopic(state.topic);
    chipsEl.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
    resetFeed();
    saved.forEach((p) => feed.insertBefore(renderCard(p), statusEl));
    setStatus(saved.length ? "end" : "saved-empty");
    if (saved.length) statusEl.firstElementChild.textContent = `That's all ${saved.length} saved post${saved.length === 1 ? "" : "s"}.`;
  }

  // ---------- settings panel ----------
  const dlg = $("#settings");
  const form = $("#settingsForm");
  let draft = null;

  function renderList(listEl, items, describe, onRemove, onToggle) {
    listEl.replaceChildren();
    items.forEach((item, i) => {
      const li = document.createElement("li");
      if (onToggle) {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = item.enabled;
        cb.setAttribute("aria-label", `Show ${item.label}`);
        cb.onchange = () => onToggle(i, cb.checked);
        li.appendChild(cb);
      }
      const text = document.createElement("div");
      text.className = "grow";
      const [main, sub] = describe(item);
      const strong = document.createElement("div");
      strong.textContent = main;
      const small = document.createElement("div");
      small.className = "sub";
      small.textContent = sub;
      text.append(strong, small);
      const x = document.createElement("button");
      x.type = "button";
      x.className = "x";
      x.textContent = "✕";
      x.setAttribute("aria-label", `Remove ${main}`);
      x.onclick = () => onRemove(i);
      li.append(text, x);
      listEl.appendChild(li);
    });
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "sub";
      li.textContent = "None yet.";
      listEl.appendChild(li);
    }
  }

  function renderDraft() {
    renderList($("#topicList"), draft.topics,
      (t) => [t.label, `id: ${t.id} · dev.to #${t.devto || "—"} · HN “${t.hn || "—"}”`],
      (i) => { draft.topics.splice(i, 1); renderDraft(); },
      (i, on) => { draft.topics[i].enabled = on; });
    renderList($("#pickList"), draft.picks,
      (p) => [p.title, [p.url, p.tags.length ? `#${p.tags.join(" #")}` : ""].filter(Boolean).join(" · ")],
      (i) => { draft.picks.splice(i, 1); renderDraft(); });
  }

  function fillForm() {
    form.elements["src-picks"].checked = draft.sources.picks;
    form.elements["src-devto"].checked = draft.sources.devto;
    form.elements["src-hn"].checked = draft.sources.hn;
    form.elements.hnMinPoints.value = draft.hnMinPoints;
    form.elements.muteWords.value = draft.muteWords.join(", ");
    $("#exportOut").hidden = true;
    showError("");
    renderDraft();
  }

  function readForm() {
    draft.sources = {
      picks: form.elements["src-picks"].checked,
      devto: form.elements["src-devto"].checked,
      hn: form.elements["src-hn"].checked,
    };
    draft.hnMinPoints = form.elements.hnMinPoints.value;
    draft.muteWords = form.elements.muteWords.value.split(",");
    return normalize(draft);
  }

  const showError = (msg) => { $("#formError").textContent = msg; };

  function openSettings() {
    draft = clone(settings);
    fillForm();
    dlg.showModal();
  }

  $("#addTopic").onclick = () => {
    const label = form.elements["t-label"].value.trim();
    const devto = form.elements["t-devto"].value.trim();
    const hn = form.elements["t-hn"].value.trim();
    if (!label) return showError("Give the topic a name.");
    if (!devto && !hn) return showError("Add a dev.to tag, an HN search, or both.");
    draft.topics.push({ id: slug(label), label, devto, hn, enabled: true });
    draft = { ...draft, topics: normalize(draft).topics };
    ["t-label", "t-devto", "t-hn"].forEach((n) => (form.elements[n].value = ""));
    showError("");
    renderDraft();
  };

  $("#addPick").onclick = () => {
    const title = form.elements["p-title"].value.trim();
    const url = form.elements["p-url"].value.trim();
    if (!title) return showError("Give the link a title.");
    if (!isHttpUrl(url)) return showError("Links need to start with http:// or https://");
    draft.picks.unshift({ title, url, note: form.elements["p-note"].value.trim(), tags: tagList(form.elements["p-tags"].value) });
    ["p-title", "p-url", "p-note", "p-tags"].forEach((n) => (form.elements[n].value = ""));
    showError("");
    renderDraft();
  };

  $("#exportBtn").onclick = async () => {
    const out = $("#exportOut");
    const header = "// OpsScroll feed configuration — exported from the app. Replace doomscroll/config.js with this and push.\n";
    out.value = `${header}window.OPSSCROLL_DEFAULTS = ${JSON.stringify(readForm(), null, 2)};\n`;
    out.hidden = false;
    out.select();
    try { await navigator.clipboard.writeText(out.value); showError(""); $("#exportBtn").textContent = "Copied ✓"; }
    catch { $("#exportBtn").textContent = "Select all & copy"; }
    setTimeout(() => ($("#exportBtn").textContent = "Export config"), 2000);
  };

  $("#resetBtn").onclick = () => {
    if (!confirm("Discard this device's changes and go back to config.js?")) return;
    draft = clone(DEFAULTS);
    fillForm();
  };

  dlg.addEventListener("close", () => {
    if (dlg.returnValue !== "save") return;
    settings = readForm();
    const same = JSON.stringify(settings) === JSON.stringify(DEFAULTS);
    writeStore(SETTINGS_KEY, same ? undefined : settings);
    renderChips();
    const stillThere = enabledTopics().find((t) => t.id === state.topic.id);
    selectTopic(stillThere || ALL);
  });

  // ---------- navigation ----------
  function currentCard() {
    const mid = feed.scrollTop + feed.clientHeight / 2;
    return [...feed.querySelectorAll(".card")].find((c) => c.offsetTop <= mid && c.offsetTop + c.offsetHeight > mid);
  }
  const step = (dir) => feed.scrollBy({ top: dir * feed.clientHeight, behavior: "smooth" });

  document.addEventListener("keydown", (e) => {
    if (dlg.open || e.metaKey || e.ctrlKey || e.altKey || e.target.matches("input, textarea")) return;
    const card = currentCard();
    switch (e.key) {
      case "j": case "ArrowDown": case " ": e.preventDefault(); step(1); break;
      case "k": case "ArrowUp": e.preventDefault(); step(-1); break;
      case "o": case "Enter": if (card) window.open(card._post.url, "_blank", "noopener"); break;
      case "c": if (card?._post.discuss) window.open(card._post.discuss, "_blank", "noopener"); break;
      case "s": if (card) $(".save", card).click(); break;
      case "b": showSaved(!state.showingSaved); break;
      case ",": openSettings(); break;
      default: return;
    }
    hideHint();
  });

  // Infinite scroll: top up whenever the reader is within three screens of the end.
  function maybeLoadMore() {
    if (feed.scrollTop + feed.clientHeight * 4 >= feed.scrollHeight) loadMore();
  }

  const hint = $("#hint");
  const hintTimer = setTimeout(() => hideHint(), 6000);
  function hideHint() { clearTimeout(hintTimer); hint.classList.add("gone"); }
  feed.addEventListener("scroll", () => {
    if (feed.scrollTop > 50) hideHint();
    maybeLoadMore();
  }, { passive: true });

  // ---------- boot ----------
  $("#settingsBtn").onclick = openSettings;
  savedToggle.onclick = () => showSaved(!state.showingSaved);
  persistSaved();
  renderChips();
  selectTopic(ALL);
  feed.focus();
})();
