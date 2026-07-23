"""Live refresh: populate the local cache from the free data sources (spec §5).

This is the only module that talks to the network. It is deliberately separate
from screening so the app runs offline against cache and a flaky provider never
blocks analysis. Every step degrades gracefully and reports what it managed to
fetch.

On this repo's build sandbox SEC egress is blocked, so refresh is exercised via
the demo seeder instead; on the user's machine ``refresh_all`` pulls live data.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from .adapters.http import HttpClient
from .adapters.prices import PriceService
from .adapters.sec_edgar import (SecFundamentalsAdapter, SecHoldingsAdapter,
                                 SecUniverseAdapter)
from .config import cache_dir
from .db import Store, open_store
from .holdings.roster import overlay_gurus
from .models import SecurityMeta

Progress = Callable[[str], None]


def _noop(_: str) -> None:
    pass


def make_clients(cfg: Dict[str, Any]):
    ua = cfg["app"]["sec_user_agent"]
    per_sec = cfg["data"].get("sec_rate_limit_per_sec", 8)
    http = HttpClient(ua, per_sec=per_sec)
    cache = cache_dir(cfg)
    prices = PriceService(http, cache, cfg["data"].get("price_provider_order"))
    return http, prices, cache


def refresh_universe(store: Store, http: HttpClient, log: Progress,
                     limit: Optional[int] = None) -> int:
    log("Fetching SEC ticker/CIK reference...")
    adapter = SecUniverseAdapter(http)
    secs: List[SecurityMeta] = adapter.list_securities()
    if limit:
        secs = secs[:limit]
    for s in secs:
        store.upsert_security({
            "ticker": s.ticker, "cik": s.cik, "name": s.name,
            "exchange": s.exchange, "sector": s.sector, "industry": s.industry,
            "is_adr": int(s.is_adr), "market_cap": s.market_cap,
            "median_dollar_volume": s.median_dollar_volume})
    log(f"  {len(secs)} securities in universe reference.")
    return len(secs)


def refresh_fundamentals(store: Store, http: HttpClient, log: Progress) -> int:
    adapter = SecFundamentalsAdapter(http)
    n = 0
    secs = store.securities()
    for i, sec in enumerate(secs, 1):
        meta = SecurityMeta(ticker=sec["ticker"], cik=sec["cik"],
                            name=sec["name"])
        f = adapter.fundamentals(meta)
        if f is not None:
            store.put_json("fundamentals", f.ticker, f.__dict__, f.as_of)
            n += 1
        if i % 100 == 0:
            log(f"  fundamentals {i}/{len(secs)}...")
    log(f"  {n} companies with fundamentals cached.")
    return n


def refresh_prices(store: Store, prices: PriceService, cfg: Dict[str, Any],
                   log: Progress) -> int:
    n = 0
    tickers = [s["ticker"] for s in store.securities()]
    for i, t in enumerate(tickers, 1):
        df = prices.history(t, refresh=True)
        if df is not None and not df.empty:
            last = float(df["close"].iloc[-1])
            mdv = prices.median_dollar_volume(t)
            store.put_json("market_data", t, {"ticker": t, "price": last})
            # apply liquidity attributes onto the security row
            sec = store.security(t)
            if sec is not None:
                f = store.get_json("fundamentals", t) or {}
                shares = f.get("shares_outstanding")
                mcap = last * shares if shares else sec["market_cap"]
                store.upsert_security({
                    "ticker": t, "cik": sec["cik"], "name": sec["name"],
                    "exchange": sec["exchange"], "sector": sec["sector"],
                    "industry": sec["industry"], "is_adr": sec["is_adr"],
                    "market_cap": mcap, "median_dollar_volume": mdv})
            n += 1
        if i % 100 == 0:
            log(f"  prices {i}/{len(tickers)}...")
    log(f"  {n} tickers priced.")
    return n


def refresh_holdings(store: Store, http: HttpClient, log: Progress,
                     cusip_map: Optional[Dict[str, str]] = None) -> int:
    adapter = SecHoldingsAdapter(http, cusip_map)
    n = 0
    for guru in overlay_gurus():
        log(f"  13F: {guru.name} (CIK {guru.cik})...")
        try:
            holdings = adapter.latest_holdings(guru.cik, guru.name)
        except Exception as exc:  # graceful per-manager degradation
            log(f"    skipped ({exc.__class__.__name__})")
            continue
        if not holdings:
            continue
        quarter = holdings[0].quarter
        store.replace_manager_holdings(
            guru.cik, quarter,
            [{"manager": h.manager, "cik": h.cik, "quarter": h.quarter,
              "filing_date": h.filing_date, "ticker": h.ticker,
              "cusip": h.cusip, "issuer": h.issuer, "shares": h.shares,
              "value": h.value, "pct_portfolio": h.pct_portfolio}
             for h in holdings])
        n += 1
    log(f"  {n} managers' 13F holdings cached.")
    return n


def refresh_all(cfg: Dict[str, Any], log: Progress = _noop,
                universe_limit: Optional[int] = None) -> Dict[str, int]:
    """Full live refresh. Returns counts per stage."""
    http, prices, cache = make_clients(cfg)
    store = open_store(cache)
    try:
        counts = {
            "securities": refresh_universe(store, http, log, universe_limit),
            "fundamentals": refresh_fundamentals(store, http, log),
            "prices": refresh_prices(store, prices, cfg, log),
            "holdings": refresh_holdings(store, http, log),
        }
        store.set_meta("last_refresh", "done")
        return counts
    finally:
        store.close()
