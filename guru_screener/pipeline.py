"""Orchestration: build the universe scorecard from cached data (spec §6, §9).

    securities + fundamentals + prices  ->  market data
                                        ->  philosophy screens (+ Magic Formula rank)
                                        ->  13F overlay
                                        ->  composite scorecard

Reads everything from the local cache (Store + PriceService), so it runs offline
and fast (spec §8). A live *refresh* (see :mod:`.refresh`) is what populates the
cache; screening never calls the network.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from .db import Store
from .factors import build_screens
from .factors.greenblatt import GreenblattScreen, rank_universe
from .holdings.overlay import build_ownership_index
from .models import Fundamentals, MarketData, ScreenResult
from .scoring import build_scorecard, rank_scorecards


def _safe_div(a: Optional[float], b: Optional[float]) -> Optional[float]:
    if a is None or b in (None, 0):
        return None
    return a / b


def compute_market_data(f: Fundamentals, price: Optional[float]
                        ) -> MarketData:
    """Derive valuation multiples from fundamentals + latest price."""
    m = MarketData(ticker=f.ticker, price=price)
    if price is None:
        return m
    shares = f.shares_outstanding
    market_cap = price * shares if shares else None
    m.pe = _safe_div(price, f.eps) if (f.eps and f.eps > 0) else None
    bvps = _safe_div(f.total_equity, shares)
    m.pb = _safe_div(price, bvps) if (bvps and bvps > 0) else None
    if m.pe is not None and f.earnings_growth and f.earnings_growth > 0:
        m.peg = m.pe / (f.earnings_growth * 100.0)
    ev = None
    if market_cap is not None:
        ev = market_cap + (f.total_debt or 0.0)
    m.enterprise_value = ev
    m.earnings_yield = _safe_div(f.ebit, ev)
    m.fcf_yield = _safe_div(f.free_cash_flow, market_cap)
    return m


def load_fundamentals(store: Store, ticker: str) -> Optional[Fundamentals]:
    payload = store.get_json("fundamentals", ticker)
    if not payload:
        return None
    return Fundamentals(**payload)


def run_screening(store: Store, cfg: Dict[str, Any],
                  price_lookup: Dict[str, float],
                  quarter: Optional[str] = None) -> List[Dict[str, Any]]:
    """Full pipeline -> ranked list of scorecard rows."""
    screens = build_screens(cfg)
    per_stock_screens = [s for s in screens if s.key != "greenblatt"]
    greenblatt: Optional[GreenblattScreen] = next(
        (s for s in screens if isinstance(s, GreenblattScreen)), None)

    securities = {s["ticker"]: s for s in store.securities()}
    ownership = build_ownership_index(store, quarter)

    # First pass: per-stock screens + collect Magic Formula factors.
    results: Dict[str, Dict[str, ScreenResult]] = {}
    market: Dict[str, MarketData] = {}
    gb_rows: List[Dict[str, Any]] = []

    for ticker, sec in securities.items():
        f = load_fundamentals(store, ticker)
        if f is None:
            continue
        m = compute_market_data(f, price_lookup.get(ticker))
        market[ticker] = m
        results[ticker] = {s.key: s.run(f, m) for s in per_stock_screens}
        if greenblatt is not None:
            ey, roc = greenblatt.compute_factors(f, m)
            gb_rows.append({"ticker": ticker, "sector": sec["sector"],
                            "market_cap": sec["market_cap"], "ey": ey, "roc": roc})

    # Second pass: cross-sectional Magic Formula rank.
    if greenblatt is not None:
        for r in rank_universe(greenblatt, gb_rows):
            results.setdefault(r.ticker, {})[greenblatt.key] = r

    # Assemble scorecards.
    rows: List[Dict[str, Any]] = []
    for ticker, screen_results in results.items():
        sec = securities.get(ticker, {})
        own = ownership.get(ticker, {"holders": [], "new_buy_by": []})
        rows.append(build_scorecard(
            ticker=ticker, meta=dict(sec), screen_results=screen_results,
            market=market.get(ticker, MarketData(ticker=ticker)),
            guru_holders=own["holders"], new_buy_by=own["new_buy_by"], cfg=cfg))
    return rank_scorecards(rows, "composite")


def price_lookup_from_cache(store: Store, price_service, tickers: List[str]
                            ) -> Dict[str, float]:
    """Latest cached price per ticker (used to compute multiples offline)."""
    out: Dict[str, float] = {}
    for t in tickers:
        # Prefer an explicit cached market_data price, else the parquet cache.
        md = store.get_json("market_data", t)
        if md and md.get("price"):
            out[t] = md["price"]
            continue
        p = price_service.latest_price(t) if price_service else None
        if p is not None:
            out[t] = p
    return out
