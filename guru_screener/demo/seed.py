"""Generate a deterministic offline demo cache (SQLite + parquet).

Synthetic, clearly-not-real numbers chosen so each screen has some passers:
* Graham value names (cheap, liquid, low debt),
* Buffett quality compounders (high stable ROE, buybacks),
* Lynch fast growers (PEG <= 1, 15-30% growth),
* Magic Formula names (high EBIT/EV + ROC),
plus 13F holdings assigned to the overlay roster so ownership badges light up.
"""
from __future__ import annotations

import math
import random
from typing import Any, Dict, List

import pandas as pd

from ..config import cache_dir, load_config
from ..db import Store, open_store
from ..holdings.roster import overlay_gurus
from ..models import Fundamentals

SEED = 42
DEMO_QUARTERS = ["2024Q4", "2025Q1"]   # for QoQ diff demonstration

# ticker: (name, sector, style, price, eps, growth, roe, revenue_bil, d2e)
# style drives which screen(s) it should tend to pass.
DEMO_STOCKS: List[Dict[str, Any]] = [
    # --- Buffett-style quality compounders ---
    {"t": "AAPL", "n": "Apple Inc.", "sec": "Technology", "style": "quality",
     "price": 210, "eps": 6.5, "g": 0.10, "roe": 0.55, "rev": 385e9, "d2e": 0.6},
    {"t": "MSFT", "n": "Microsoft Corp.", "sec": "Technology", "style": "quality",
     "price": 430, "eps": 11.8, "g": 0.14, "roe": 0.39, "rev": 245e9, "d2e": 0.4},
    {"t": "KO", "n": "Coca-Cola Co.", "sec": "Consumer Staples", "style": "quality",
     "price": 62, "eps": 2.7, "g": 0.06, "roe": 0.40, "rev": 46e9, "d2e": 1.5},
    {"t": "MCO", "n": "Moody's Corp.", "sec": "Financials", "style": "quality",
     "price": 470, "eps": 11.0, "g": 0.12, "roe": 0.60, "rev": 7e9, "d2e": 1.8},
    {"t": "V", "n": "Visa Inc.", "sec": "Financials", "style": "quality",
     "price": 285, "eps": 9.5, "g": 0.13, "roe": 0.48, "rev": 36e9, "d2e": 0.5},
    # --- Graham deep value ---
    {"t": "F", "n": "Ford Motor Co.", "sec": "Consumer Discretionary", "style": "value",
     "price": 11, "eps": 1.6, "g": 0.04, "roe": 0.16, "rev": 176e9, "d2e": 3.2},
    {"t": "GM", "n": "General Motors Co.", "sec": "Consumer Discretionary", "style": "value",
     "price": 48, "eps": 8.5, "g": 0.05, "roe": 0.14, "rev": 172e9, "d2e": 1.7},
    {"t": "BAC", "n": "Bank of America Corp.", "sec": "Financials", "style": "value",
     "price": 40, "eps": 3.2, "g": 0.05, "roe": 0.11, "rev": 96e9, "d2e": 1.1},
    {"t": "PFE", "n": "Pfizer Inc.", "sec": "Health Care", "style": "value",
     "price": 27, "eps": 2.1, "g": 0.03, "roe": 0.12, "rev": 60e9, "d2e": 0.7},
    {"t": "INTC", "n": "Intel Corp.", "sec": "Technology", "style": "value",
     "price": 21, "eps": 1.4, "g": 0.02, "roe": 0.09, "rev": 55e9, "d2e": 0.5},
    # --- Lynch fast growers (PEG-friendly) ---
    {"t": "GOOGL", "n": "Alphabet Inc.", "sec": "Technology", "style": "growth",
     "price": 175, "eps": 7.5, "g": 0.20, "roe": 0.30, "rev": 328e9, "d2e": 0.1},
    {"t": "META", "n": "Meta Platforms", "sec": "Technology", "style": "growth",
     "price": 500, "eps": 22.0, "g": 0.22, "roe": 0.32, "rev": 150e9, "d2e": 0.3},
    {"t": "DHI", "n": "D.R. Horton", "sec": "Consumer Discretionary", "style": "growth",
     "price": 155, "eps": 14.0, "g": 0.18, "roe": 0.22, "rev": 36e9, "d2e": 0.3},
    {"t": "LEN", "n": "Lennar Corp.", "sec": "Consumer Discretionary", "style": "growth",
     "price": 165, "eps": 15.5, "g": 0.16, "roe": 0.16, "rev": 35e9, "d2e": 0.2},
    {"t": "CROX", "n": "Crocs Inc.", "sec": "Consumer Discretionary", "style": "growth",
     "price": 130, "eps": 12.5, "g": 0.19, "roe": 0.70, "rev": 4e9, "d2e": 1.0},
    # --- Magic Formula candidates (high yield + ROC) ---
    {"t": "CI", "n": "Cigna Group", "sec": "Health Care", "style": "magic",
     "price": 340, "eps": 25.0, "g": 0.11, "roe": 0.14, "rev": 195e9, "d2e": 0.7},
    {"t": "CVS", "n": "CVS Health", "sec": "Health Care", "style": "magic",
     "price": 60, "eps": 6.5, "g": 0.06, "roe": 0.10, "rev": 358e9, "d2e": 0.9},
    {"t": "HPQ", "n": "HP Inc.", "sec": "Technology", "style": "magic",
     "price": 36, "eps": 3.4, "g": 0.05, "roe": 1.20, "rev": 54e9, "d2e": 4.0},
    {"t": "T", "n": "AT&T Inc.", "sec": "Communication", "style": "magic",
     "price": 22, "eps": 2.3, "g": 0.03, "roe": 0.12, "rev": 122e9, "d2e": 1.3},
    {"t": "COR", "n": "Cencora Inc.", "sec": "Health Care", "style": "magic",
     "price": 240, "eps": 13.0, "g": 0.10, "roe": 0.80, "rev": 295e9, "d2e": 2.5},
    # --- a few overlay favorites / mixed ---
    {"t": "BRK.B", "n": "Berkshire Hathaway B", "sec": "Financials", "style": "quality",
     "price": 460, "eps": 20.0, "g": 0.09, "roe": 0.12, "rev": 370e9, "d2e": 0.2},
    {"t": "AXP", "n": "American Express", "sec": "Financials", "style": "quality",
     "price": 250, "eps": 13.0, "g": 0.12, "roe": 0.33, "rev": 60e9, "d2e": 1.8},
    {"t": "OXY", "n": "Occidental Petroleum", "sec": "Energy", "style": "value",
     "price": 58, "eps": 4.0, "g": 0.05, "roe": 0.18, "rev": 27e9, "d2e": 1.0},
    {"t": "CVX", "n": "Chevron Corp.", "sec": "Energy", "style": "value",
     "price": 155, "eps": 12.0, "g": 0.04, "roe": 0.14, "rev": 200e9, "d2e": 0.2},
    {"t": "SFM", "n": "Sprouts Farmers Market", "sec": "Consumer Staples", "style": "growth",
     "price": 110, "eps": 3.5, "g": 0.24, "roe": 0.30, "rev": 7e9, "d2e": 0.4},
    {"t": "NVR", "n": "NVR Inc.", "sec": "Consumer Discretionary", "style": "magic",
     "price": 8200, "eps": 500.0, "g": 0.12, "roe": 0.35, "rev": 10e9, "d2e": 0.1},
    {"t": "DVA", "n": "DaVita Inc.", "sec": "Health Care", "style": "magic",
     "price": 155, "eps": 9.5, "g": 0.10, "roe": 1.50, "rev": 12e9, "d2e": 5.0},
    {"t": "AMZN", "n": "Amazon.com", "sec": "Consumer Discretionary", "style": "growth",
     "price": 185, "eps": 5.0, "g": 0.25, "roe": 0.20, "rev": 620e9, "d2e": 0.5},
    {"t": "LLY", "n": "Eli Lilly", "sec": "Health Care", "style": "quality",
     "price": 880, "eps": 13.0, "g": 0.30, "roe": 0.55, "rev": 40e9, "d2e": 2.0},
    {"t": "JNJ", "n": "Johnson & Johnson", "sec": "Health Care", "style": "quality",
     "price": 160, "eps": 9.8, "g": 0.06, "roe": 0.25, "rev": 88e9, "d2e": 0.5},
]

# 13F assignments: which gurus hold which tickers (weights auto-generated).
GURU_HOLDINGS = {
    "buffett": ["AAPL", "AXP", "KO", "OXY", "CVX", "MCO", "BAC", "V"],
    "greenblatt": ["HPQ", "CI", "CVS", "T", "COR", "GOOGL", "META"],
    "klarman": ["GM", "OXY", "CVS", "PFE"],
    "pabrai": ["OXY", "GM", "F"],
    "akre": ["V", "MCO", "AXP", "GOOGL"],
    "lilu": ["BAC", "GOOGL", "BRK.B"],
    "ackman": ["GOOGL", "CVS", "V", "AXP"],
    "einhorn": ["GM", "CI", "INTC"],
    "terry_smith": ["MSFT", "META", "V", "LLY"],
    "burry": ["PFE", "CVS", "INTC"],
}
# Newly-bought this quarter (for QoQ "new buy" badge).
NEW_BUYS_2025Q1 = {"buffett": ["V"], "greenblatt": ["META"], "burry": ["CVS"],
                   "terry_smith": ["LLY"]}


def _fundamentals_for(s: Dict[str, Any], rng: random.Random) -> Fundamentals:
    price, eps, g, roe = s["price"], s["eps"], s["g"], s["roe"]
    rev = s["rev"]
    net_income = rev * (0.08 if s["style"] != "value" else 0.05)
    equity = net_income / roe if roe else rev * 0.4
    shares = net_income / eps if eps else rev / price
    ebit = net_income * 1.35
    total_debt = equity * s["d2e"]
    interest = max(total_debt * 0.05, 1.0)
    # current ratio: value names engineered >= 2.0, others varied
    cur_ratio = round(rng.uniform(2.0, 3.2), 2) if s["style"] == "value" \
        else round(rng.uniform(0.9, 2.4), 2)
    assets_cur = rev * 0.3
    liab_cur = assets_cur / cur_ratio
    wc = assets_cur - liab_cur
    lt_debt = total_debt * 0.8
    # FCF positive for quality/growth/magic; sometimes thin for value
    fcf = net_income * (1.1 if s["style"] in ("quality", "magic") else 0.9)
    nwc = wc
    nfa = rev * 0.25
    # histories
    eps_hist = [round(eps * (1 + g) ** (-(9 - i)), 2) for i in range(10)]
    if s["style"] == "value":  # ensure a couple positive-but-bumpy years
        eps_hist = [max(0.05, e) for e in eps_hist]
    roe_hist = [round(roe * rng.uniform(0.9, 1.1), 3) for _ in range(6)]
    gm = 0.55 if s["style"] == "quality" else (0.30 if s["style"] == "value" else 0.42)
    om = gm * 0.5
    gm_hist = [round(gm * (1 + 0.01 * i), 3) for i in range(5)]
    om_hist = [round(om * (1 + 0.01 * i), 3) for i in range(5)]
    shares_hist = [round(shares * (1.03 ** (4 - i)), 2) for i in range(5)]  # declining
    cum10 = (eps_hist[-1] - eps_hist[0]) / abs(eps_hist[0]) if eps_hist[0] else None

    return Fundamentals(
        ticker=s["t"], as_of="2025-03-31",
        revenue=rev, net_income=net_income, eps=eps, eps_history=eps_hist,
        current_ratio=cur_ratio, long_term_debt=lt_debt, working_capital=wc,
        total_debt=total_debt, total_equity=equity, debt_to_equity=s["d2e"],
        interest_coverage=ebit / interest, roe=roe, roe_history=roe_hist,
        roa=roe * 0.5, roic=roe * 0.7,
        gross_margin=gm, gross_margin_history=gm_hist,
        operating_margin=om, operating_margin_history=om_hist,
        ebit=ebit, free_cash_flow=fcf, shares_outstanding=shares,
        shares_history=shares_hist, book_value=equity,
        net_working_capital=nwc, net_fixed_assets=nfa,
        earnings_growth=g, cumulative_eps_growth_10y=cum10,
    )


def _price_series(price: float, rng: random.Random, days: int = 900
                  ) -> pd.DataFrame:
    """Deterministic gently-trending random walk ending near ``price``."""
    dates = pd.bdate_range(end="2025-06-30", periods=days)
    # build backwards from final price
    vals = [price]
    for _ in range(days - 1):
        drift = rng.uniform(-0.012, 0.013)
        vals.append(vals[-1] / (1 + drift))
    vals = list(reversed(vals))
    vol = [int(rng.uniform(2e6, 3e7)) for _ in range(days)]
    return pd.DataFrame({"close": vals, "volume": vol}, index=dates)


def seed(cfg: Dict[str, Any] | None = None) -> Store:
    cfg = cfg or load_config()
    cache = cache_dir(cfg)
    store = open_store(cache)
    rng = random.Random(SEED)

    from ..adapters.prices import PriceService
    from ..adapters.http import HttpClient
    prices = PriceService(HttpClient("demo/seed"), cache,
                          cfg["data"].get("price_provider_order"))

    for s in DEMO_STOCKS:
        f = _fundamentals_for(s, rng)
        shares = f.shares_outstanding
        mcap = s["price"] * shares if shares else None
        store.upsert_security({
            "ticker": s["t"], "cik": None, "name": s["n"],
            "exchange": "Nasdaq" if s["sec"] == "Technology" else "NYSE",
            "sector": s["sec"], "industry": s["sec"], "is_adr": 0,
            "market_cap": mcap, "median_dollar_volume": rng.uniform(5e6, 5e8)})
        store.put_json("fundamentals", s["t"], f.__dict__, f.as_of)
        store.put_json("market_data", s["t"], {"ticker": s["t"], "price": s["price"]})
        df = _price_series(s["price"], rng)
        prices.write_cache(s["t"], df)

    # benchmark for backtest
    prices.write_cache("SPY", _price_series(560, rng))

    # 13F holdings for two quarters (QoQ diff)
    key_to_cik = {g.key: g.cik for g in overlay_gurus()}
    for q in DEMO_QUARTERS:
        for guru_key, tickers in GURU_HOLDINGS.items():
            cik = key_to_cik.get(guru_key)
            if not cik:
                continue
            guru = next(g for g in overlay_gurus() if g.key == guru_key)
            # In the earlier quarter, drop the names that are "new buys" later.
            active = list(tickers)
            if q == DEMO_QUARTERS[0]:
                for nb in NEW_BUYS_2025Q1.get(guru_key, []):
                    if nb in active:
                        active.remove(nb)
            raw = []
            for tk in active:
                sec = store.security(tk)
                px = next((d["price"] for d in DEMO_STOCKS if d["t"] == tk), 100)
                shares = rng.uniform(1e5, 5e6)
                raw.append((tk, sec, shares, shares * px))
            total_value = sum(v for *_, v in raw) or 1.0
            rows = [{
                "manager": guru.name, "cik": cik, "quarter": q,
                "filing_date": "2025-05-15" if q == "2025Q1" else "2025-02-14",
                "ticker": tk, "cusip": f"DEMO{tk:<7}"[:9].replace(" ", "0"),
                "issuer": sec["name"] if sec else tk,
                "shares": shares, "value": value,
                "pct_portfolio": 100.0 * value / total_value}
                for tk, sec, shares, value in raw]
            store.replace_manager_holdings(cik, q, rows)

    store.set_meta("demo_seeded", "1")
    store.set_meta("current_quarter", DEMO_QUARTERS[-1])
    return store
