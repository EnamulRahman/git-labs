from __future__ import annotations

import base64
import json
import urllib.parse
import urllib.request

USER_AGENT = "jobhunt/0.1 (personal job search tool)"


def get_json(url: str, params: dict | None = None, basic_user: str | None = None, timeout: int = 30):
    if params:
        url = f"{url}?{urllib.parse.urlencode({k: v for k, v in params.items() if v not in (None, '')})}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    if basic_user is not None:
        token = base64.b64encode(f"{basic_user}:".encode()).decode()
        req.add_header("Authorization", f"Basic {token}")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)
