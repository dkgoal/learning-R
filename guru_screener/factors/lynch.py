"""Lynch — GARP screen (spec §6.1)."""
from __future__ import annotations

from typing import List

from ..models import Criterion, Fundamentals, MarketData
from .base import Screen, crit, ge, le


def categorize(growth: float | None) -> str:
    """Rough Lynch category tag from the earnings growth rate."""
    if growth is None:
        return "unknown"
    if growth >= 0.50:
        return "too hot"
    if growth >= 0.20:
        return "fast grower"
    if growth >= 0.10:
        return "stalwart"
    if growth >= 0.0:
        return "slow grower"
    return "turnaround/cyclical"


class LynchScreen(Screen):
    key = "lynch"
    label = "Lynch — GARP"

    def evaluate(self, f: Fundamentals, m: MarketData) -> List[Criterion]:
        c = self.cfg
        out: List[Criterion] = []

        out.append(crit("PEG <= 1.0", m.peg, c["max_peg"], le(c["max_peg"]),
                        weight=2.0, note="Core GARP test"))

        g = f.earnings_growth
        in_band = (None if g is None
                   else c["fast_grower_low"] <= g <= c["fast_grower_high"])
        note = f"category: {categorize(g)}"
        if g is not None and g > c["too_hot_growth"]:
            note += " (>50% — flagged too hot)"
        out.append(Criterion("Growth in fast-grower band (15-30%)", in_band,
                             value=g, threshold=f"{c['fast_grower_low']:.0%}"
                             f"-{c['fast_grower_high']:.0%}", note=note))

        out.append(crit("Manageable debt", f.debt_to_equity,
                        c["max_debt_to_equity"], le(c["max_debt_to_equity"])))

        if c.get("require_positive_fcf", True):
            out.append(crit("Positive free cash flow", f.free_cash_flow, 0,
                            ge(0.0)))
        return out
