// OpsScroll feed configuration — this is YOUR feed. Edit, commit, push.
//
// These are the defaults every device starts with. Changes made in the app's
// ⚙ Settings panel are stored on that device only; use Settings → "Export config"
// to get a new version of this file, paste it here and push to make it the default.
window.OPSSCROLL_DEFAULTS = {
  // Where posts come from.
  sources: {
    devto: true,  // dev.to articles, matched by tag
    hn: true,     // Hacker News stories, matched by search query
    picks: true,  // your own hand-picked links (below), shown first
  },

  // Hacker News stories need at least this many points to appear.
  hnMinPoints: 10,

  // Topic chips. "All" mixes every enabled topic.
  //   devto: a dev.to tag (lowercase, no spaces) — leave "" to skip dev.to for this topic
  //   hn:    a Hacker News search query           — leave "" to skip HN for this topic
  topics: [
    { id: "devops",        label: "DevOps",        devto: "devops",        hn: "devops",               enabled: true },
    { id: "kubernetes",    label: "Kubernetes",    devto: "kubernetes",    hn: "kubernetes",           enabled: true },
    { id: "docker",        label: "Docker",        devto: "docker",        hn: "docker",               enabled: true },
    { id: "terraform",     label: "Terraform",     devto: "terraform",     hn: "terraform",            enabled: true },
    { id: "cicd",          label: "CI/CD",         devto: "cicd",          hn: "CI/CD",                enabled: true },
    { id: "aws",           label: "AWS",           devto: "aws",           hn: "AWS",                  enabled: true },
    { id: "sre",           label: "SRE",           devto: "sre",           hn: "SRE",                  enabled: true },
    { id: "observability", label: "Observability", devto: "observability", hn: "observability",        enabled: true },
    { id: "postmortems",   label: "Postmortems",   devto: "postmortem",    hn: "incident postmortem",  enabled: true },
    { id: "linux",         label: "Linux",         devto: "linux",         hn: "linux",                enabled: false },
  ],

  // Hide any post whose title, description or tags contain one of these (case-insensitive).
  muteWords: [],

  // Your own links, pinned to the top of the feed.
  //   tags: topic ids this pick also appears under (it always appears under "All").
  picks: [
    {
      title: "Google SRE Book — free online",
      url: "https://sre.google/sre-book/table-of-contents/",
      note: "The classic. Start with 'Eliminating Toil' and 'Postmortem Culture'.",
      tags: ["sre"],
    },
  ],
};
