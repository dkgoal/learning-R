"""Graham — Defensive Value screen (spec §6.1)."""
from __future__ import annotations

import math
from typing import List

from ..models import Criterion, Fundamentals, MarketData
from .base import Screen, crit, ge, le


class GrahamScreen(Screen):
    key = "graham"
    label = "Graham — Defensive Value"

    def evaluate(self, f: Fundamentals, m: MarketData) -> List[Criterion]:
        c = self.cfg
        out: List[Criterion] = []

        out.append(crit("Adequate size (revenue)", f.revenue,
                        c["min_revenue"], ge(c["min_revenue"]),
                        note="Large enough to be seasoned"))

        out.append(crit("Current ratio >= 2.0", f.current_ratio,
                        c["min_current_ratio"], ge(c["min_current_ratio"])))

        if c.get("ltdebt_le_working_capital", True):
            ok = (None if (f.long_term_debt is None or f.working_capital is None)
                  else f.long_term_debt <= f.working_capital)
            out.append(Criterion("Long-term debt <= working capital", ok,
                                 value=f.long_term_debt,
                                 threshold=f.working_capital))

        # Positive EPS every year over the lookback (or all available).
        yrs = c["positive_eps_years"]
        hist = f.eps_history[-yrs:] if f.eps_history else []
        if hist:
            all_pos = all(e is not None and e > 0 for e in hist)
            out.append(Criterion(
                f"Positive EPS every year ({len(hist)}y)", all_pos,
                value=f"{sum(1 for e in hist if e and e>0)}/{len(hist)} positive",
                threshold="all positive"))
        else:
            out.append(Criterion("Positive EPS every year", None,
                                 note="No EPS history"))

        out.append(crit("Cumulative EPS growth (10y)",
                        f.cumulative_eps_growth_10y,
                        c["min_cumulative_eps_growth_10y"],
                        ge(c["min_cumulative_eps_growth_10y"])))

        out.append(crit("P/E <= 15", m.pe, c["max_pe"], le(c["max_pe"])))
        out.append(crit("P/B <= 1.5", m.pb, c["max_pb"], le(c["max_pb"])))

        graham_ratio = (m.pe * m.pb) if (m.pe is not None and m.pb is not None
                                         and m.pe > 0 and m.pb > 0) else None
        out.append(crit("Graham number (P/E x P/B <= 22.5)", graham_ratio,
                        c["max_graham_ratio"], le(c["max_graham_ratio"]),
                        note="Combined valuation ceiling"))

        if c.get("net_net_variant", False):
            ok = (None if (m.price is None or f.ncav is None or f.shares_outstanding
                           in (None, 0)) else m.price < (f.ncav / f.shares_outstanding))
            out.append(Criterion("Net-net: price < NCAV/share", ok,
                                 value=m.price, threshold="NCAV/share",
                                 weight=0.5))
        return out
