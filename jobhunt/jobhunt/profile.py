from __future__ import annotations

import re
import tomllib
from pathlib import Path


def load_profile(path: str | Path, cv_path: str | Path | None = None) -> dict:
    with open(path, "rb") as f:
        profile = tomllib.load(f)
    profile["skills"] = {k.lower(): v for k, v in profile.get("skills", {}).items()}
    if cv_path:
        profile["skills"] = weight_by_cv(profile["skills"], Path(cv_path).read_text(encoding="utf-8"))
    return profile


def weight_by_cv(skills: dict[str, float], cv_text: str) -> dict[str, float]:
    """Boost skills the CV mentions often; keep unmentioned ones at a token weight
    so jobs aren't ranked on skills the candidate hasn't shown."""
    cv = cv_text.lower()
    out = {}
    for skill, weight in skills.items():
        hits = len(re.findall(rf"(?<![a-z0-9]){re.escape(skill)}(?![a-z0-9])", cv))
        out[skill] = weight * (1 + min(hits, 5) * 0.1) if hits else min(weight, 1)
    return out
