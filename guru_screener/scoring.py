"""Scorecard & composite ranking (spec §6.4).

Per stock we assemble: each philosophy's pass/fail + score, a weighted composite,
a guru-ownership count (+ bonus), and a valuation snapshot. Everything traces
back to the underlying criteria (spec §8 transparency).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from .models import MarketData, ScreenResult


def composite_score(screen_results: Dict[str, ScreenResult],
                    guru_count: int, cfg: Dict[str, Any]) -> float:
    """Weighted mean of per-screen scores + a capped guru-ownership bonus."""
    weights = cfg.get("scoring", {}).get("weights", {})
    num = 0.0
    den = 0.0
    for key, res in screen_results.items():
        w = weights.get(key, 1.0)
        num += w * res.score
        den += w
    base = (num / den) if den else 0.0

    sc = cfg.get("scoring", {})
    bonus = min(guru_count * sc.get("guru_ownership_bonus_per_holder", 2.0),
                sc.get("guru_ownership_bonus_cap", 20.0))
    return round(min(base + bonus, 100.0), 1)


def build_scorecard(ticker: str, meta: Dict[str, Any],
                    screen_results: Dict[str, ScreenResult],
                    market: MarketData, guru_holders: List[str],
                    new_buy_by: List[str], cfg: Dict[str, Any]
                    ) -> Dict[str, Any]:
    """Assemble one stock's full scorecard row for the UI / CSV."""
    passes = [k for k, r in screen_results.items() if r.passed]
    comp = composite_score(screen_results, len(guru_holders), cfg)

    row: Dict[str, Any] = {
        "ticker": ticker,
        "name": meta.get("name", ""),
        "sector": meta.get("sector", ""),
        "is_adr": bool(meta.get("is_adr", 0)),
        "market_cap": meta.get("market_cap"),
        "price": market.price,
        "pe": market.pe,
        "pb": market.pb,
        "peg": market.peg,
        "fcf_yield": market.fcf_yield,
        "earnings_yield": market.earnings_yield,
        "composite": comp,
        "passes": passes,                       # philosophy pass chips
        "n_passes": len(passes),
        "guru_holders": guru_holders,           # who actually owns it
        "n_gurus": len(guru_holders),
        "new_buy_by": new_buy_by,               # gurus who newly bought this Q
    }
    # Per-screen score columns (traceable to criteria on the detail view).
    for key, res in screen_results.items():
        row[f"{key}_score"] = round(res.score, 1)
        row[f"{key}_pass"] = res.passed
        if res.rank is not None:
            row[f"{key}_rank"] = res.rank
    return row


def rank_scorecards(rows: List[Dict[str, Any]],
                    sort_by: str = "composite") -> List[Dict[str, Any]]:
    """Sort scorecard rows descending by the chosen column (None last)."""
    def key(r: Dict[str, Any]):
        v = r.get(sort_by)
        return (v is None, -(v if isinstance(v, (int, float)) else 0))
    return sorted(rows, key=key)
