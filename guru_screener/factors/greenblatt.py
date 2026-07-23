"""Greenblatt — Magic Formula screen (spec §6.1).

Unlike the other three, this screen is *rank-based across the universe*: rank
every eligible name by earnings yield (EBIT/EV) and by return on capital
(EBIT / (net working capital + net fixed assets)), sum the ranks, and take the
top-N. Financials & utilities are excluded per Greenblatt's method.

Two entry points:
* :meth:`compute_factors` — per-stock EBIT/EV and ROC (usable in the scorecard).
* :func:`rank_universe`   — the cross-sectional combination producing ranks and
  the top-N pass flags.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from ..models import Criterion, Fundamentals, MarketData, ScreenResult
from .base import Screen


class GreenblattScreen(Screen):
    key = "greenblatt"
    label = "Greenblatt — Magic Formula"

    def eligible(self, sector: str, market_cap: Optional[float]) -> bool:
        excl = self.cfg.get("exclude_sectors", ["Financials", "Utilities"])
        if sector in excl:
            return False
        floor = self.cfg.get("min_market_cap", 0)
        if market_cap is not None and market_cap < floor:
            return False
        return True

    def compute_factors(self, f: Fundamentals, m: MarketData
                        ) -> Tuple[Optional[float], Optional[float]]:
        """Return (earnings_yield, return_on_capital) for this stock."""
        ey = m.earnings_yield
        if ey is None and f.ebit is not None and m.enterprise_value:
            ey = f.ebit / m.enterprise_value
        roc = None
        capital = None
        if f.net_working_capital is not None and f.net_fixed_assets is not None:
            capital = f.net_working_capital + f.net_fixed_assets
        if f.ebit is not None and capital:
            roc = f.ebit / capital
        return ey, roc

    # evaluate() exists for interface symmetry; scoring happens in rank_universe.
    def evaluate(self, f: Fundamentals, m: MarketData) -> List[Criterion]:
        ey, roc = self.compute_factors(f, m)
        return [
            Criterion("Earnings yield (EBIT/EV)", ey is not None, value=ey,
                      note="higher is cheaper"),
            Criterion("Return on capital", roc is not None, value=roc,
                      note="higher is better quality"),
        ]


def rank_universe(screen: GreenblattScreen,
                  rows: List[Dict[str, Any]]) -> List[ScreenResult]:
    """Combine EY + ROC ranks over eligible rows; flag the top-N.

    ``rows`` items must carry keys: ticker, sector, market_cap, ey, roc.
    Score is 100 for the best combined rank, scaling down linearly.
    """
    eligible = [r for r in rows
                if screen.eligible(r.get("sector", ""), r.get("market_cap"))
                and r.get("ey") is not None and r.get("roc") is not None]

    # Rank 1 = best. Higher EY better; higher ROC better.
    by_ey = sorted(eligible, key=lambda r: r["ey"], reverse=True)
    ey_rank = {r["ticker"]: i + 1 for i, r in enumerate(by_ey)}
    by_roc = sorted(eligible, key=lambda r: r["roc"], reverse=True)
    roc_rank = {r["ticker"]: i + 1 for i, r in enumerate(by_roc)}

    combined = []
    for r in eligible:
        t = r["ticker"]
        combined.append((t, ey_rank[t] + roc_rank[t], r))
    combined.sort(key=lambda x: x[1])

    n = len(combined)
    top_n = screen.cfg.get("top_n", 30)
    results: List[ScreenResult] = []
    for pos, (ticker, comb, r) in enumerate(combined, start=1):
        score = 100.0 * (n - pos + 1) / n if n else 0.0
        results.append(ScreenResult(
            screen="greenblatt", ticker=ticker, score=score,
            passed=pos <= top_n, rank=pos,
            criteria=[
                Criterion("Earnings yield (EBIT/EV)", True, value=r["ey"],
                          threshold=f"rank {ey_rank[ticker]}/{n}"),
                Criterion("Return on capital", True, value=r["roc"],
                          threshold=f"rank {roc_rank[ticker]}/{n}"),
                Criterion("Combined rank", pos <= top_n, value=pos,
                          threshold=f"top {top_n}"),
            ],
            note=f"combined rank {pos} of {n} eligible"))
    return results
