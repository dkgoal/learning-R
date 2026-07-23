"""Light backtest module (spec §7) — approximate, NOT point-in-time.

Runs a chosen screen "as of" a past quarter over the *current* cached universe,
forms an equal-weight basket of the names it selects, and reports forward returns
at 1/3/6/12 months vs a benchmark. Every result is labelled and the basket is
fully inspectable.

Honest caveats baked in (returned on every result):
* Free data is not point-in-time: today's fundamentals are used, not those known
  at the as-of date (look-ahead bias).
* Survivorship bias: delisted tickers vanish from free price sources.
* 13F lag: overlays reflect filings ~45 days stale.
Treat output as directional sanity-checking, not validated performance.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import pandas as pd

CAVEATS = [
    "Approximate — NOT point-in-time.",
    "Uses today's fundamentals (look-ahead bias), not those known at the as-of date.",
    "Survivorship bias: delisted names are missing from free price history.",
    "13F overlays are ~45 days lagged.",
    "No transaction costs, taxes, or slippage. Not tradeable performance.",
]


def _forward_return(prices: pd.DataFrame, start_date: pd.Timestamp,
                    months: int) -> Optional[float]:
    """Total return from the first trading day on/after start to +months."""
    if prices is None or prices.empty:
        return None
    idx = prices.index
    start = idx[idx >= start_date]
    if len(start) == 0:
        return None
    s = start[0]
    end_date = s + pd.DateOffset(months=months)
    end = idx[idx >= end_date]
    if len(end) == 0:
        return None
    e = end[0]
    p0 = float(prices.loc[s, "close"])
    p1 = float(prices.loc[e, "close"])
    if p0 <= 0:
        return None
    return p1 / p0 - 1.0


def run_backtest(price_service, selected: List[str], as_of: str,
                 cfg: Dict[str, Any], benchmark: str = "SPY"
                 ) -> Dict[str, Any]:
    """Equal-weight basket forward returns vs benchmark at each horizon."""
    horizons = cfg.get("backtest", {}).get("horizons_months", [1, 3, 6, 12])
    max_basket = cfg.get("backtest", {}).get("max_basket_size", 50)
    basket = selected[:max_basket]
    start = pd.Timestamp(as_of)

    per_name: Dict[str, Dict[str, Optional[float]]] = {}
    horizon_rets: Dict[int, List[float]] = {h: [] for h in horizons}
    for t in basket:
        hist = price_service.history(t, lookback_days=1500)
        rets = {}
        for h in horizons:
            r = _forward_return(hist, start, h)
            rets[h] = r
            if r is not None:
                horizon_rets[h].append(r)
        per_name[t] = rets

    bench_hist = price_service.history(benchmark, lookback_days=1500)
    bench = {h: _forward_return(bench_hist, start, h) for h in horizons}

    summary = {}
    for h in horizons:
        vals = horizon_rets[h]
        basket_ret = sum(vals) / len(vals) if vals else None
        b = bench[h]
        summary[h] = {
            "basket_return": basket_ret,
            "benchmark_return": b,
            "excess": (basket_ret - b) if (basket_ret is not None
                                           and b is not None) else None,
            "n_priced": len(vals),
        }

    return {
        "as_of": as_of,
        "benchmark": benchmark,
        "basket": basket,
        "basket_size": len(basket),
        "per_name": {t: {str(h): v for h, v in r.items()}
                     for t, r in per_name.items()},
        "summary": {str(h): v for h, v in summary.items()},
        "caveats": CAVEATS,
    }
