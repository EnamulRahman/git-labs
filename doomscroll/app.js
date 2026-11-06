// OpsScroll — an endless, snap-scrolling feed of DevOps content.
// Sources: dev.to public API and Hacker News (Algolia) search API. No keys, no backend.
(() => {
  "use strict";

  const TOPICS = [
    { id: "all",           label: "All",           devto: "devops",        hn: null },
    { id: "kubernetes",    label: "Kubernetes",    devto: "kubernetes",    hn: "kubernetes" },
    { id: "docker",        label: "Docker",        devto: "docker",        hn: "docker" },
    { id: "terraform",     label: "Terraform",     devto: "terraform",     hn: "terraform" },
    { id: "cicd",          label: "CI/CD",         devto: "cicd",          hn: "CI/CD" },
    { id: "aws",           label: "AWS",           devto: "aws",           hn: "AWS" },
    { id: "sre",           label: "SRE",           devto: "sre",           hn: "SRE" },
    { id: "observability", label: "Observability", devto: "observability", hn: "observability" },
    { id: "linux",         label: "Linux",         devto: "linux",         hn: "linux" },
  ];
  // "All" rotates Hacker News through these queries, one per page.
  const ALL_HN_QUERIES = ["devops", "kubernetes", "terraform", "SRE", "docker", "observability", "CI/CD", "incident postmortem"];
  const PAGE_SIZE = 12;
  const HN_MIN_POINTS = 10;
  const STORE_KEY = "opsscroll:saved";

  const $ = (sel) => document.querySelector(sel);
  const feed = $("#feed");
  const chipsEl = $("#chips");
  const tpl = $("#cardTpl");
  const savedToggle = $("#savedToggle");
  const savedCountEl = $("#savedCount");

  const state = {
    topic: TOPICS[0],
    page: 1,
    loading: false,
    exhausted: false,
    seen: new Set(),
    showingSaved: false,
    generation: 0, // bumps on topic change so stale responses are dropped
  };

  // ---------- saved posts (per-browser convenience) ----------
  const loadSaved = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
  };
  let saved = loadSaved();
  const persistSaved = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch { /* storage unavailable */ }
    savedCountEl.textContent = saved.length;
  };
  const isSaved = (id) => saved.some((p) => p.id === id);
  const toggleSave = (post) => {
    saved = isSaved(post.id) ? saved.filter((p) => p.id !== post.id) : [post, ...saved];
    persistSaved();
  };

  // ---------- fetching & normalising ----------
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
      `&tags=story&hitsPerPage=${PAGE_SIZE}&page=${page - 1}&numericFilters=points>${HN_MIN_POINTS}`;
    const data = await getJSON(url);
    return data.hits
      .filter((h) => h.title)
      .map((h) => {
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

  // Interleave two lists so the feed alternates sources.
  function interleave(a, b) {
    const out = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i]) out.push(a[i]);
      if (b[i]) out.push(b[i]);
    }
    return out;
  }

  async function loadMore() {
    if (state.loading || state.exhausted || state.showingSaved) return;
    state.loading = true;
    const gen = state.generation;
    const { topic, page } = state;
    const hnQuery = topic.hn ?? ALL_HN_QUERIES[(page - 1) % ALL_HN_QUERIES.length];
    const hnPage = topic.hn ? page : Math.floor((page - 1) / ALL_HN_QUERIES.length) + 1;
    setStatus("loading");

    const [dev, hn] = await Promise.allSettled([fetchDevto(topic.devto, page), fetchHN(hnQuery, hnPage)]);
    if (gen !== state.generation) return; // topic changed mid-flight

    const devItems = dev.status === "fulfilled" ? dev.value : [];
    const hnItems = hn.status === "fulfilled" ? hn.value : [];
    state.loading = false;

    if (dev.status === "rejected" && hn.status === "rejected") {
      setStatus("error");
      return;
    }

    const fresh = interleave(devItems, hnItems).filter((p) => {
      const key = p.url;
      if (state.seen.has(key)) return false;
      state.seen.add(key);
      return true;
    });

    state.page += 1;
    if (devItems.length === 0 && hnItems.length === 0) {
      state.exhausted = true;
      setStatus("end");
      return;
    }
    // If the reader is parked on the loading placeholder, move them to the first new post;
    // otherwise Chrome re-snaps to the placeholder and drags them to the end of the feed.
    const parkedOnStatus = feed.scrollTop + feed.clientHeight / 2 > statusEl.offsetTop;
    const nodes = fresh.map(renderCard);
    nodes.forEach((n) => feed.insertBefore(n, statusEl));
    if (parkedOnStatus && nodes[0]) nodes[0].scrollIntoView({ block: "start" });
    setStatus("idle");
    // Keep the buffer full (also covers dedupe filtering out a whole page).
    maybeLoadMore();
  }

  // ---------- rendering ----------
  function timeAgo(ms) {
    if (!ms) return "";
    const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
    const units = [["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]];
    for (const [u, n] of units) if (s >= n) return `${Math.floor(s / n)}${u} ago`;
    return `${s}s ago`;
  }

  function renderCard(post) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = post.id;
    node._post = post;

    const src = node.querySelector(".source");
    src.textContent = post.source === "hn" ? "Hacker News" : "DEV";
    src.classList.add(post.source);
    node.querySelector(".age").textContent = [timeAgo(post.time), post.author && `by ${post.author}`].filter(Boolean).join(" · ");

    const img = node.querySelector(".cover");
    if (post.cover && /^https:\/\//.test(post.cover)) {
      img.src = post.cover;
      img.onerror = () => { img.hidden = true; };
    } else {
      img.hidden = true;
    }

    node.querySelector(".title").textContent = post.title;
    node.querySelector(".desc").textContent = post.desc;

    const tags = node.querySelector(".tags");
    [...new Set(post.tags)].slice(0, 5).forEach((t) => {
      const li = document.createElement("li");
      li.textContent = `#${t}`;
      tags.appendChild(li);
    });

    const bits = [`▲ ${post.score}`, `💬 ${post.comments}`];
    if (post.readMins) bits.push(`${post.readMins} min read`);
    node.querySelector(".stats").textContent = bits.join("  ·  ");

    node.querySelector(".open").href = post.url;
    node.querySelector(".discuss").href = post.discuss;

    const saveBtn = node.querySelector(".save");
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
    statusEl.replaceChildren();
    if (kind === "loading") {
      statusEl.innerHTML = '<div><div class="spinner"></div>Fetching more ops content…</div>';
    } else if (kind === "error") {
      statusEl.innerHTML = '<div>Couldn\'t reach the feeds.<br><br><button class="btn primary" type="button">Retry</button></div>';
      statusEl.querySelector("button").onclick = () => loadMore();
    } else if (kind === "end") {
      statusEl.innerHTML = "<div>You've hit the bottom. Go touch grass (or pick another topic).</div>";
    } else if (kind === "saved-empty") {
      statusEl.innerHTML = "<div>Nothing saved yet. Press <b>s</b> or tap ☆ on a post.</div>";
    } else {
      statusEl.innerHTML = '<div><div class="spinner"></div></div>';
    }
  }

  function resetFeed() {
    state.generation += 1;
    state.page = 1;
    state.loading = false;
    state.exhausted = false;
    state.seen.clear();
    feed.replaceChildren(statusEl);
    feed.scrollTop = 0;
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

  // ---------- navigation ----------
  function currentCard() {
    const cards = [...feed.querySelectorAll(".card")];
    const mid = feed.scrollTop + feed.clientHeight / 2;
    return cards.find((c) => c.offsetTop <= mid && c.offsetTop + c.offsetHeight > mid);
  }
  function step(dir) {
    feed.scrollBy({ top: dir * feed.clientHeight, behavior: "smooth" });
  }

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.matches("input, textarea")) return;
    const card = currentCard();
    switch (e.key) {
      case "j": case "ArrowDown": case " ": e.preventDefault(); step(1); break;
      case "k": case "ArrowUp": e.preventDefault(); step(-1); break;
      case "o": case "Enter": if (card) window.open(card._post.url, "_blank", "noopener"); break;
      case "c": if (card) window.open(card._post.discuss, "_blank", "noopener"); break;
      case "s": if (card) card.querySelector(".save").click(); break;
      case "b": showSaved(!state.showingSaved); break;
      default: return;
    }
    hideHint();
  });

  // Infinite scroll: top up whenever the reader is within three screens of the end.
  function maybeLoadMore() {
    if (feed.scrollTop + feed.clientHeight * 4 >= feed.scrollHeight) loadMore();
  }

  const hint = $("#hint");
  let hintTimer = setTimeout(() => hideHint(), 6000);
  function hideHint() { clearTimeout(hintTimer); hint.classList.add("gone"); }
  feed.addEventListener("scroll", () => {
    if (feed.scrollTop > 50) hideHint();
    maybeLoadMore();
  }, { passive: true });

  // ---------- boot ----------
  TOPICS.forEach((t) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.dataset.id = t.id;
    b.textContent = t.label;
    b.onclick = () => selectTopic(t);
    chipsEl.appendChild(b);
  });
  savedToggle.onclick = () => showSaved(!state.showingSaved);
  persistSaved();
  selectTopic(TOPICS[0]);
  feed.focus();
})();
