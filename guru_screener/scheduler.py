"""Scheduled auto-refresh (spec §5 caching cadence).

Keeps the local cache current without manual runs. It wakes on an interval and
performs a *stale-only* refresh, so each source is re-fetched no more often than
its TTL (prices daily, fundamentals/13F quarterly). Prices therefore update about
once a day while the expensive SEC pulls happen only when a quarter has aged out.

Two ways to run it:
* ``python -m guru_screener schedule`` — a long-lived foreground loop (simplest;
  good under a service manager / a terminal you leave open).
* An OS scheduler calling ``python -m guru_screener refresh --stale`` on a cron
  (see the README) — preferred for a true "set and forget" install.
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Callable, Dict

from .refresh import refresh_all

Log = Callable[[str], None]


def run_once(cfg: Dict[str, Any], log: Log = print) -> Dict[str, int]:
    """One stale-only refresh pass."""
    log(f"[{datetime.now().isoformat(timespec='seconds')}] checking for stale data…")
    counts = refresh_all(cfg, log=log, only_stale=True)
    refreshed = {k: v for k, v in counts.items() if v >= 0}
    log(f"  refreshed: {refreshed or 'nothing (all fresh)'}")
    return counts


def run_forever(cfg: Dict[str, Any], interval_seconds: int = 3600,
                log: Log = print) -> None:
    """Foreground loop: stale-only refresh every ``interval_seconds``.

    Network/provider errors in a pass are logged and swallowed so a transient
    outage never kills the loop; the next tick retries.
    """
    log(f"Scheduler started — checking every {interval_seconds}s. Ctrl-C to stop.")
    while True:
        try:
            run_once(cfg, log)
        except KeyboardInterrupt:
            log("Scheduler stopped.")
            return
        except Exception as exc:  # keep the loop alive across provider hiccups
            log(f"  refresh pass failed ({exc.__class__.__name__}: {exc}); "
                f"will retry next tick.")
        try:
            time.sleep(interval_seconds)
        except KeyboardInterrupt:
            log("Scheduler stopped.")
            return
