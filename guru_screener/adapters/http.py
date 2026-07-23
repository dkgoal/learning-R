"""Polite, rate-limited HTTP helper shared by live adapters.

SEC fair-use requires a descriptive ``User-Agent`` with contact info and asks
callers to stay well under 10 requests/second (spec §5, §8 politeness). This
helper enforces a simple client-side rate limit and sets the header.
"""
from __future__ import annotations

import time
from threading import Lock
from typing import Any, Dict, Optional

import requests


class RateLimiter:
    """Minimal token-ish limiter: sleeps so calls stay under a per-second cap."""

    def __init__(self, per_sec: float):
        self.min_interval = 1.0 / max(per_sec, 0.1)
        self._last = 0.0
        self._lock = Lock()

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            delta = now - self._last
            if delta < self.min_interval:
                time.sleep(self.min_interval - delta)
            self._last = time.monotonic()


class HttpClient:
    def __init__(self, user_agent: str, per_sec: float = 8.0,
                 timeout: float = 20.0):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": user_agent,
            "Accept-Encoding": "gzip, deflate",
        })
        self.limiter = RateLimiter(per_sec)
        self.timeout = timeout

    def get(self, url: str, *, params: Optional[Dict[str, Any]] = None,
            accept: Optional[str] = None) -> requests.Response:
        self.limiter.wait()
        headers = {"Accept": accept} if accept else None
        resp = self.session.get(url, params=params, headers=headers,
                                timeout=self.timeout)
        resp.raise_for_status()
        return resp

    def get_json(self, url: str, **kw: Any) -> Any:
        return self.get(url, accept="application/json", **kw).json()

    def get_text(self, url: str, **kw: Any) -> str:
        return self.get(url, **kw).text
