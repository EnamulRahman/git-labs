"""Reed.co.uk Jobseeker API. Free key: https://www.reed.co.uk/developers/jobseeker"""
from __future__ import annotations

import os
from datetime import datetime

from ..http import get_json
from ..models import Job
from ..text import strip_html

URL = "https://www.reed.co.uk/api/1.0/search"


def available() -> bool:
    return bool(os.environ.get("REED_API_KEY"))


def parse(data: dict) -> list[Job]:
    jobs = []
    for r in data.get("results", []):
        posted = ""
        if r.get("date"):
            try:
                posted = datetime.strptime(r["date"], "%d/%m/%Y").date().isoformat()
            except ValueError:
                pass
        jobs.append(Job(
            source="reed",
            source_id=str(r.get("jobId", "")),
            title=r.get("jobTitle", ""),
            company=r.get("employerName", ""),
            location=r.get("locationName", ""),
            url=r.get("jobUrl", ""),
            description=strip_html(r.get("jobDescription", "")),
            salary_min=r.get("minimumSalary"),
            salary_max=r.get("maximumSalary"),
            posted=posted,
        ))
    return jobs


def search(query: str, settings: dict) -> list[Job]:
    params = {
        "keywords": query,
        "locationName": settings["location"],
        "distanceFromLocation": settings["radius_miles"],
        "resultsToTake": 100,
    }
    return parse(get_json(URL, params, basic_user=os.environ["REED_API_KEY"]))
