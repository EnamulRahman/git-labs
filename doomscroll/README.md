# OpsScroll

An endless, snap-scrolling feed of DevOps content that works like TikTok, but for Kubernetes and postmortems.

Posts come live from the [dev.to](https://dev.to) public API and from Hacker News, through the Algolia search API.
It has no backend, no build step and no API keys.

## Run it

```bash
cd doomscroll
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly also works in most browsers.)

## Choosing your content

You decide what's in the feed, in two places:

1. **`config.js`: the default feed on every device.** Edit it and push. It sets:
   - `sources`: turn dev.to, Hacker News and your own picks on or off
   - `hnMinPoints`: hide Hacker News stories with fewer points than this
   - `topics`: the topic chips. Each one has a `devto` tag and/or an `hn` search query, and can be `enabled: false`
   - `muteWords`: hide any post mentioning these words
   - `picks`: your own links, pinned to the top, each with an optional note and topic tags
2. **⚙ Settings in the app (or press `,`): changes on one device.** Make the same changes from your phone.
   They're saved on that device only. Use **Export config** to copy them as a new `config.js`, paste that into the repo and push to make them everyone's default.
   **Reset to config.js** discards that device's changes.

## Features

- One post per screen, snap scrolling, with more posts loading as you go
- Topic chips that you define. "All" mixes every enabled topic
- Mixes your pinned picks, dev.to articles and Hacker News stories, drops duplicates and hides muted words
- Save posts for later (kept in your browser's localStorage)
- Light and dark themes that follow your OS

## Keyboard

| Key | Action |
| --- | --- |
| `j` / `↓` / space | next post |
| `k` / `↑` | previous post |
| `o` / Enter | open article |
| `c` | open comments |
| `s` | save / unsave |
| `b` | toggle saved view |
| `,` | open settings |
