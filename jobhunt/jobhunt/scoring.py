from __future__ import annotations

import re

from .models import Job

YEARS = re.compile(r"(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years|yrs)", re.I)


def _has(term: str, text: str) -> bool:
    return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text) is not None


def score_job(job: Job, profile: dict) -> Job:
    s = profile["scoring"]
    title = job.title.lower()
    text = f"{title} {job.description.lower()}"
    score, reasons = 0.0, []

    for term in s["exclude"]:
        if _has(term, title):
            job.score, job.reasons = -100, [f"excluded: '{term}' in title"]
            return job

    if any(_has(t, title) for t in s["good_titles"]):
        score += 20
        reasons.append("relevant title")

    for word, pts in s["seniority"].items():
        if _has(word, title):
            score += pts
            reasons.append(f"{word} ({pts:+})")

    matched = [k for k in profile["skills"] if _has(k, text)]
    if matched:
        score += sum(profile["skills"][k] for k in matched)
        reasons.append("skills: " + ", ".join(matched))

    years = [int(m) for m in YEARS.findall(text)]
    if years and max(years) >= s["max_years_experience"]:
        score -= 15
        reasons.append(f"asks {max(years)}+ yrs")

    min_salary = profile["search"].get("min_salary")
    top = job.salary_max or job.salary_min
    if min_salary and top:
        if top < min_salary:
            score -= 10
            reasons.append(f"pay below £{min_salary:,}")
        else:
            score += 5

    if len(job.also_on) > 0:
        reasons.append("also on " + ", ".join(job.also_on))

    job.score, job.reasons = round(score, 1), reasons
    return job


def dedupe(jobs: list[Job]) -> list[Job]:
    merged: dict[str, Job] = {}
    for job in jobs:
        existing = merged.get(job.key)
        if existing is None:
            merged[job.key] = job
        elif job.source != existing.source and job.source not in existing.also_on:
            existing.also_on.append(job.source)
            existing.salary_min = existing.salary_min or job.salary_min
            existing.salary_max = existing.salary_max or job.salary_max
            if len(job.description) > len(existing.description):
                existing.description = job.description
    return list(merged.values())
