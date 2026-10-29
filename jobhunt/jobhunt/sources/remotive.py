"""Remotive remote-jobs API (no key needed). Only keeps roles open to UK-based candidates."""
from __future__ import annotations

import re

from ..http import get_json
from ..models import Job
from ..text import strip_html

URL = "https://remotive.com/api/remote-jobs"
UK_OK = re.compile(r"\b(uk|united kingdom|gb|great britain|europe|emea|worldwide|anywhere|global)\b", re.I)


def available() -> bool:
    return True


def parse(data: dict) -> list[Job]:
    jobs = []
    for r in data.get("jobs", []):
        where = r.get("candidate_required_location") or ""
        if where and not UK_OK.search(where):
            continue
        jobs.append(Job(
            source="remotive",
            source_id=str(r.get("id", "")),
            title=r.get("title", ""),
            company=r.get("company_name", ""),
            location=f"Remote ({where or 'unspecified'})",
            url=r.get("url", ""),
            description=strip_html(r.get("description", "")),
            posted=(r.get("publication_date") or "")[:10],
        ))
    return jobs


def search(query: str, settings: dict) -> list[Job]:
    return parse(get_json(URL, {"search": query, "limit": 100}))
