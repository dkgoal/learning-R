"""TTL staleness gating used by the scheduler (no network)."""
from datetime import datetime, timedelta

from guru_screener.refresh import _is_stale, _stamp


def test_never_run_is_stale(store):
    assert _is_stale(store, "prices", 1) is True


def test_fresh_after_stamp(store):
    _stamp(store, "prices")
    assert _is_stale(store, "prices", 1) is False


def test_zero_ttl_always_stale(store):
    _stamp(store, "prices")
    assert _is_stale(store, "prices", 0) is True


def test_expired_timestamp_is_stale(store):
    old = (datetime.now() - timedelta(days=5)).isoformat(timespec="seconds")
    store.set_meta("last_refresh_prices", old)
    assert _is_stale(store, "prices", 1) is True
    assert _is_stale(store, "prices", 10) is False


def test_corrupt_timestamp_is_stale(store):
    store.set_meta("last_refresh_prices", "not-a-date")
    assert _is_stale(store, "prices", 1) is True
