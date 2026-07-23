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

# Transient statuses worth retrying with backoff. 403/407 are org/proxy policy
# denials or SEC blocks — retrying those is pointless (and rude), so they raise.
_RETRY_STATUS = {429, 500, 502, 503, 504}


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
                 timeout: float = 20.0, max_retries: int = 4,
                 backoff_base: float = 1.5):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": user_agent,
            "Accept-Encoding": "gzip, deflate",
        })
        self.limiter = RateLimiter(per_sec)
        self.timeout = timeout
        self.max_retries = max_retries
        self.backoff_base = backoff_base

    def get(self, url: str, *, params: Optional[Dict[str, Any]] = None,
            accept: Optional[str] = None) -> requests.Response:
        """GET with rate limiting + exponential backoff on transient failures.

        Retries connection errors, timeouts, and 429/5xx responses; honours a
        ``Retry-After`` header when present. Non-transient HTTP errors (e.g. 403,
        404) raise immediately.
        """
        headers = {"Accept": accept} if accept else None
        last_exc: Optional[Exception] = None
        for attempt in range(self.max_retries + 1):
            self.limiter.wait()
            try:
                resp = self.session.get(url, params=params, headers=headers,
                                        timeout=self.timeout)
            except (requests.ConnectionError, requests.Timeout) as exc:
                last_exc = exc
            else:
                if resp.status_code in _RETRY_STATUS:
                    last_exc = requests.HTTPError(
                        f"{resp.status_code} for {url}", response=resp)
                    self._sleep_for(attempt, resp)
                    continue
                resp.raise_for_status()
                return resp
            self._sleep_for(attempt, None)
        assert last_exc is not None
        raise last_exc

    def _sleep_for(self, attempt: int, resp: Optional[requests.Response]) -> None:
        if attempt >= self.max_retries:
            return
        delay = self.backoff_base ** attempt
        if resp is not None:
            retry_after = resp.headers.get("Retry-After")
            if retry_after:
                try:
                    delay = max(delay, float(retry_after))
                except ValueError:
                    pass
        time.sleep(delay)

    def get_json(self, url: str, **kw: Any) -> Any:
        return self.get(url, accept="application/json", **kw).json()

    def get_text(self, url: str, **kw: Any) -> str:
        return self.get(url, **kw).text
