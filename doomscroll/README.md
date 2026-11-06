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

## Features

- One post per screen, snap scrolling, with more posts loading as you go
- Topic chips: All, Kubernetes, Docker, Terraform, CI/CD, AWS, SRE, Observability, Linux
- Mixes dev.to articles with Hacker News stories, and drops duplicates
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
