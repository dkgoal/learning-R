"""13F overlay: quarter-over-quarter diffs and the two views (spec §6.3).

* Overlay-on-screen: for a ticker, who holds it (and who newly bought this Q).
* Manager view: everything a manager holds, sorted by weight, with the QoQ diff.

The ~45-day filing lag is always surfaced via filing_date + quarter on results.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..db import Store
from ..models import HoldingDiff
from .roster import ROSTER_BY_CIK, ROSTER_BY_KEY, Guru


def _prev_quarter(quarter: str) -> Optional[str]:
    """'2024Q2' -> '2024Q1'; '2024Q1' -> '2023Q4'."""
    try:
        y, q = quarter.split("Q")
        y, q = int(y), int(q)
    except ValueError:
        return None
    return f"{y}Q{q-1}" if q > 1 else f"{y-1}Q4"


def classify(shares_prev: float, shares_now: float) -> str:
    if shares_prev == 0 and shares_now > 0:
        return "new"
    if shares_now == 0 and shares_prev > 0:
        return "exit"
    if shares_now > shares_prev * 1.001:
        return "add"
    if shares_now < shares_prev * 0.999:
        return "trim"
    return "hold"


def manager_diff(store: Store, guru: Guru, quarter: str) -> List[HoldingDiff]:
    """QoQ diff for one manager between ``quarter`` and the prior quarter."""
    prev_q = _prev_quarter(quarter)
    now = {h["cusip"]: h for h in store.holdings_for_manager(guru.cik, quarter)}
    prev = ({h["cusip"]: h for h in store.holdings_for_manager(guru.cik, prev_q)}
            if prev_q else {})
    diffs: List[HoldingDiff] = []
    for cusip in set(now) | set(prev):
        n = now.get(cusip)
        p = prev.get(cusip)
        sh_now = n["shares"] if n else 0.0
        sh_prev = p["shares"] if p else 0.0
        ref = n or p
        diffs.append(HoldingDiff(
            manager=guru.name,
            ticker=ref["ticker"] or ref["issuer"],
            action=classify(sh_prev, sh_now),
            shares_prev=sh_prev, shares_now=sh_now,
            value_now=(n["value"] if n else 0.0),
            pct_portfolio=(n["pct_portfolio"] if n else 0.0)))
    # Sort held positions by weight desc, then exits.
    diffs.sort(key=lambda d: (d.action == "exit", -d.pct_portfolio))
    return diffs


def manager_view(store: Store, guru_key: str,
                 quarter: Optional[str] = None) -> Dict[str, Any]:
    """Everything a manager holds this quarter, weight-sorted, with QoQ diff."""
    guru = ROSTER_BY_KEY[guru_key]
    quarters = store.manager_quarters(guru.cik) if guru.cik else []
    q = quarter or (quarters[0] if quarters else None)
    if not q:
        return {"guru": guru.name, "quarter": None, "holdings": [], "quarters": []}
    rows = store.holdings_for_manager(guru.cik, q)
    diff = {d.ticker: d.action for d in manager_diff(store, guru, q)}
    holdings = []
    for h in rows:
        tk = h["ticker"] or h["issuer"]
        holdings.append({
            "ticker": h["ticker"], "issuer": h["issuer"],
            "shares": h["shares"], "value": h["value"],
            "pct_portfolio": round(h["pct_portfolio"], 2),
            "action": diff.get(tk, "hold"),
            "filing_date": h["filing_date"],
        })
    return {
        "guru": guru.name, "vehicle": guru.vehicle, "philosophy": guru.philosophy,
        "quarter": q, "quarters": quarters, "n_positions": len(holdings),
        "filing_date": rows[0]["filing_date"] if rows else "",
        "holdings": holdings,
    }


def overlay_for_ticker(store: Store, ticker: str,
                       quarter: Optional[str] = None) -> Dict[str, Any]:
    """Who holds this ticker, and who newly bought it this quarter."""
    q = quarter or (store.all_quarters()[0] if store.all_quarters() else None)
    holders: List[str] = []
    new_buy_by: List[str] = []
    details: List[Dict[str, Any]] = []
    if not q:
        return {"holders": holders, "new_buy_by": new_buy_by, "details": details}
    for h in store.holdings_for_ticker(ticker, q):
        guru = ROSTER_BY_CIK.get(h["cik"])
        name = guru.name if guru else h["manager"]
        holders.append(name)
        details.append({
            "manager": name, "shares": h["shares"], "value": h["value"],
            "pct_portfolio": round(h["pct_portfolio"], 2),
            "filing_date": h["filing_date"], "quarter": h["quarter"],
        })
        if guru:
            for d in manager_diff(store, guru, q):
                if d.ticker in (ticker, h["issuer"]) and d.action == "new":
                    new_buy_by.append(name)
                    break
    return {"holders": holders, "new_buy_by": sorted(set(new_buy_by)),
            "details": details, "quarter": q}


def build_ownership_index(store: Store, quarter: Optional[str] = None
                          ) -> Dict[str, Dict[str, List[str]]]:
    """Precompute ticker -> {holders, new_buy_by} for the whole quarter (fast).

    Avoids per-ticker diff recomputation when building the full scorecard.
    """
    q = quarter or (store.all_quarters()[0] if store.all_quarters() else None)
    index: Dict[str, Dict[str, List[str]]] = {}
    if not q:
        return index
    # Precompute each overlay manager's new buys once.
    new_buys: Dict[str, set] = {}
    for cik in {g.cik for g in ROSTER_BY_CIK.values()}:
        guru = ROSTER_BY_CIK.get(cik)
        if not guru:
            continue
        new_buys[cik] = {d.ticker for d in manager_diff(store, guru, q)
                         if d.action == "new"}
    for cik, guru in ROSTER_BY_CIK.items():
        for h in store.holdings_for_manager(cik, q):
            tk = h["ticker"]
            if not tk:
                continue
            slot = index.setdefault(tk, {"holders": [], "new_buy_by": []})
            slot["holders"].append(guru.name)
            if tk in new_buys.get(cik, set()) or h["issuer"] in new_buys.get(cik, set()):
                slot["new_buy_by"].append(guru.name)
    return index
