"""Adzuna API (aggregates many UK boards). Free key: https://developer.adzuna.com/"""
from __future__ import annotations

import os

from ..http import get_json
from ..models import Job
from ..text import strip_html

URL = "https://api.adzuna.com/v1/api/jobs/gb/search/1"


def available() -> bool:
    return bool(os.environ.get("ADZUNA_APP_ID") and os.environ.get("ADZUNA_APP_KEY"))


def parse(data: dict) -> list[Job]:
    return [
        Job(
            source="adzuna",
            source_id=str(r.get("id", "")),
            title=strip_html(r.get("title", "")),
            company=(r.get("company") or {}).get("display_name", ""),
            location=(r.get("location") or {}).get("display_name", ""),
            url=r.get("redirect_url", ""),
            description=strip_html(r.get("description", "")),
            salary_min=r.get("salary_min"),
            salary_max=r.get("salary_max"),
            posted=(r.get("created") or "")[:10],
        )
        for r in data.get("results", [])
    ]


def search(query: str, settings: dict) -> list[Job]:
    params = {
        "app_id": os.environ["ADZUNA_APP_ID"],
        "app_key": os.environ["ADZUNA_APP_KEY"],
        "what": query,
        "where": settings["location"],
        "distance": round(settings["radius_miles"] * 1.609),
        "max_days_old": settings["max_days_old"],
        "results_per_page": 50,
        "content-type": "application/json",
    }
    return parse(get_json(URL, params))
