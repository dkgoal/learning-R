"""Integration tests over the demo-seeded cache: pipeline, overlay, scoring."""
from guru_screener.pipeline import (run_screening, compute_market_data,
                                    load_fundamentals, price_lookup_from_cache)
from guru_screener.holdings.overlay import (overlay_for_ticker, manager_view,
                                           classify, build_ownership_index)
from guru_screener.scoring import composite_score
from guru_screener.models import Fundamentals


def _rows(store, cfg, price_service):
    tickers = [s["ticker"] for s in store.securities()]
    px = price_lookup_from_cache(store, price_service, tickers)
    return run_screening(store, cfg, px, store.get_meta("current_quarter"))


def test_pipeline_produces_ranked_scorecards(store, cfg, price_service):
    rows = _rows(store, cfg, price_service)
    assert len(rows) == 30
    # sorted descending by composite
    comps = [r["composite"] for r in rows]
    assert comps == sorted(comps, reverse=True)
    # every row carries per-screen scores and overlay fields
    r0 = rows[0]
    for k in ("graham_score", "buffett_score", "lynch_score", "greenblatt_score"):
        assert k in r0
    assert "guru_holders" in r0 and "passes" in r0


def test_market_data_multiples():
    f = Fundamentals(ticker="Z", eps=5.0, total_equity=1e9,
                     shares_outstanding=1e8, earnings_growth=0.10,
                     ebit=2e8, total_debt=1e8, free_cash_flow=1.5e8)
    m = compute_market_data(f, price=50.0)
    assert round(m.pe, 1) == 10.0            # 50/5
    assert round(m.pb, 1) == 5.0             # 50 / (1e9/1e8=10)
    assert round(m.peg, 2) == 1.0            # 10 / (0.10*100)
    assert m.earnings_yield is not None and m.fcf_yield is not None


def test_classify_actions():
    assert classify(0, 100) == "new"
    assert classify(100, 0) == "exit"
    assert classify(100, 200) == "add"
    assert classify(200, 100) == "trim"
    assert classify(100, 100) == "hold"


def test_overlay_new_buys_detected(store):
    # From the demo seed: Buffett newly bought V in 2025Q1.
    ov = overlay_for_ticker(store, "V")
    assert "Warren Buffett" in ov["holders"]
    assert "Warren Buffett" in ov["new_buy_by"]


def test_manager_view_sorted_by_weight(store):
    mv = manager_view(store, "buffett")
    assert mv["n_positions"] > 0
    weights = [h["pct_portfolio"] for h in mv["holdings"]]
    assert weights == sorted(weights, reverse=True)


def test_ownership_index_matches_overlay(store):
    idx = build_ownership_index(store)
    ov = overlay_for_ticker(store, "GOOGL")
    assert set(idx.get("GOOGL", {}).get("holders", [])) == set(ov["holders"])


def test_composite_score_bonus_capped():
    cfg = {"scoring": {"weights": {"a": 1.0}, "guru_ownership_bonus_per_holder": 2.0,
                       "guru_ownership_bonus_cap": 20.0}}
    from guru_screener.models import ScreenResult
    sr = {"a": ScreenResult(screen="a", ticker="X", score=50.0, passed=False)}
    assert composite_score(sr, guru_count=0, cfg=cfg) == 50.0
    assert composite_score(sr, guru_count=100, cfg=cfg) == 70.0  # capped at +20
