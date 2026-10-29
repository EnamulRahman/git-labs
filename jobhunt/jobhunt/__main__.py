from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from .profile import load_profile
from .report import load_seen, mark_seen, write_csv, write_markdown
from .scoring import dedupe, score_job
from .sources import SOURCES


def collect(profile: dict, source_names: list[str]) -> list:
    settings = profile["search"]
    jobs = []
    for name in source_names:
        mod = SOURCES[name]
        if not mod.available():
            print(f"[skip] {name}: API credentials not set", file=sys.stderr)
            continue
        if name == "remotive" and not settings.get("include_remote", True):
            continue
        for q in settings["queries"]:
            try:
                found = mod.search(q, settings)
            except Exception as e:  # one board failing shouldn't sink the run
                print(f"[error] {name} '{q}': {e}", file=sys.stderr)
                continue
            print(f"[ok] {name} '{q}': {len(found)}", file=sys.stderr)
            jobs.extend(found)
    return jobs


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="jobhunt", description="Search job boards and rank results against your CV.")
    p.add_argument("--profile", default="profile.toml")
    p.add_argument("--cv", help="plain-text/markdown CV; boosts skills it mentions")
    p.add_argument("--sources", default=",".join(SOURCES), help="comma-separated: " + ",".join(SOURCES))
    p.add_argument("--out", default="output")
    p.add_argument("--min-score", type=float, default=25)
    p.add_argument("--from-json", help="score a saved raw dump instead of calling the APIs")
    args = p.parse_args(argv)

    profile = load_profile(args.profile, args.cv)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    if args.from_json:
        from .models import Job
        raw = [Job(**d) for d in json.loads(Path(args.from_json).read_text())]
    else:
        raw = collect(profile, [s.strip() for s in args.sources.split(",") if s.strip()])
        (out / "raw.json").write_text(json.dumps([j.__dict__ for j in raw], indent=1))

    cutoff = (datetime.now().date() - timedelta(days=profile["search"]["max_days_old"])).isoformat()
    jobs = [j for j in dedupe(raw) if not j.posted or j.posted >= cutoff]
    jobs = sorted((score_job(j, profile) for j in jobs), key=lambda j: j.score, reverse=True)

    seen_path = out / "seen.json"
    seen = load_seen(seen_path)
    new = mark_seen(jobs, seen, date.today().isoformat())
    seen_path.write_text(json.dumps(seen, indent=1))

    write_csv(jobs, out / "jobs.csv", new)
    write_markdown(jobs, out / "report.md", new, args.min_score)
    good = sum(j.score >= args.min_score for j in jobs)
    print(f"{len(raw)} fetched, {len(jobs)} unique, {good} scored ≥ {args.min_score:g}, {len(new)} new → {out}/report.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
