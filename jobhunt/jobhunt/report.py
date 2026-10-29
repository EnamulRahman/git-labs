from __future__ import annotations

import csv
import json
from datetime import date
from pathlib import Path

from .models import Job


def load_seen(path: Path) -> dict[str, str]:
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def mark_seen(jobs: list[Job], seen: dict[str, str], today: str) -> set[str]:
    """Record jobs in `seen` and return the keys that weren't there before."""
    new = {j.key for j in jobs if j.key not in seen}
    for key in new:
        seen[key] = today
    return new


def write_csv(jobs: list[Job], path: Path, new: set[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["score", "new", "title", "company", "location", "salary", "posted", "source", "also_on", "url", "reasons"])
        for j in jobs:
            w.writerow([j.score, j.key in new, j.title, j.company, j.location, j.salary_text, j.posted,
                        j.source, " ".join(j.also_on), j.url, "; ".join(j.reasons)])


def _md_escape(s: str) -> str:
    return s.replace("|", "\\|").replace("[", "(").replace("]", ")")


def write_markdown(jobs: list[Job], path: Path, new: set[str], min_score: float) -> None:
    shown = [j for j in jobs if j.score >= min_score]
    lines = [
        f"# Job matches — {date.today().isoformat()}",
        "",
        f"{len(shown)} of {len(jobs)} unique jobs scored ≥ {min_score}. 🆕 = not seen in a previous run.",
        "",
        "| Score | Role | Company | Location | Salary | Posted | Why |",
        "|---:|---|---|---|---|---|---|",
    ]
    for j in shown:
        flag = "🆕 " if j.key in new else ""
        lines.append(
            f"| {j.score:g} | {flag}[{_md_escape(j.title)}]({j.url}) | {_md_escape(j.company)} | "
            f"{_md_escape(j.location)} | {j.salary_text} | {j.posted} | {_md_escape('; '.join(j.reasons))} |"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
