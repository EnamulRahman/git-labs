from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class Job:
    source: str
    source_id: str
    title: str
    company: str
    location: str
    url: str
    description: str = ""
    salary_min: float | None = None
    salary_max: float | None = None
    posted: str = ""  # ISO date (YYYY-MM-DD) when known
    also_on: list[str] = field(default_factory=list)
    score: float = 0.0
    reasons: list[str] = field(default_factory=list)

    @property
    def key(self) -> str:
        """Board-independent identity used to merge duplicates across sources."""
        def norm(s: str) -> str:
            s = re.sub(r"\b(ltd|limited|plc|llp|inc|uk|group)\b", "", s.lower())
            return re.sub(r"[^a-z0-9]+", " ", s).strip()

        return f"{norm(self.title)}|{norm(self.company)}"

    @property
    def salary_text(self) -> str:
        lo, hi = self.salary_min, self.salary_max
        if not lo and not hi:
            return ""
        if lo and hi and lo != hi:
            return f"£{lo:,.0f}–£{hi:,.0f}"
        return f"£{(lo or hi):,.0f}"
