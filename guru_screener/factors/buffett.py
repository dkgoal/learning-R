"""Buffett — Quality / Moat screen (spec §6.1)."""
from __future__ import annotations

from typing import List

from ..models import Criterion, Fundamentals, MarketData
from .base import Screen, crit, ge, le


def _stable_or_rising(series: List[float], tol: float = 0.02) -> bool | None:
    """True if the series is roughly flat-to-expanding (moat proxy)."""
    vals = [v for v in series if v is not None]
    if len(vals) < 2:
        return None
    return vals[-1] >= vals[0] - tol


class BuffettScreen(Screen):
    key = "buffett"
    label = "Buffett — Quality / Moat"

    def evaluate(self, f: Fundamentals, m: MarketData) -> List[Criterion]:
        c = self.cfg
        out: List[Criterion] = []

        out.append(crit("ROE >= 15%", f.roe, c["min_roe"], ge(c["min_roe"])))

        yrs = c["roe_consistency_years"]
        hist = f.roe_history[-yrs:] if f.roe_history else []
        if hist:
            consistent = all(r is not None and r >= c["min_roe"] for r in hist)
            out.append(Criterion(
                f"Consistent ROE ({len(hist)}y)", consistent,
                value=f"{sum(1 for r in hist if r and r>=c['min_roe'])}/{len(hist)}",
                threshold=f">= {c['min_roe']:.0%} each year"))
        else:
            out.append(Criterion("Consistent ROE", None, note="No ROE history"))

        out.append(crit("Interest coverage >= 5x", f.interest_coverage,
                        c["min_interest_coverage"], ge(c["min_interest_coverage"])))
        out.append(crit("Debt/equity modest", f.debt_to_equity,
                        c["max_debt_to_equity"], le(c["max_debt_to_equity"])))

        if c.get("require_margin_stability", True):
            gm = _stable_or_rising(f.gross_margin_history)
            om = _stable_or_rising(f.operating_margin_history)
            out.append(Criterion("Stable/expanding gross margin", gm,
                                 value=f.gross_margin, note="Moat proxy"))
            out.append(Criterion("Stable/expanding operating margin", om,
                                 value=f.operating_margin, note="Moat proxy"))

        out.append(crit("Positive free cash flow", f.free_cash_flow, 0,
                        ge(0.0)))
        out.append(crit("Positive FCF yield", m.fcf_yield,
                        c["min_fcf_yield"], ge(c["min_fcf_yield"]),
                        note="Valuation sanity check"))

        if c.get("require_flat_or_declining_shares", True):
            sh = f.shares_history
            ok = (None if len([s for s in sh if s is not None]) < 2
                  else sh[-1] <= sh[0] * 1.01)
            out.append(Criterion("Flat/declining share count", ok,
                                 value=(sh[-1] if sh else None),
                                 threshold=(sh[0] if sh else None),
                                 note="Buyback discipline"))
        return out
