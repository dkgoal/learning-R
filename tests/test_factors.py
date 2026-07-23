"""Screen logic tests — pure functions, no cache needed."""
from guru_screener.factors.base import score_criteria, crit, ge, le
from guru_screener.factors.graham import GrahamScreen
from guru_screener.factors.buffett import BuffettScreen
from guru_screener.factors.lynch import LynchScreen, categorize
from guru_screener.factors.greenblatt import GreenblattScreen, rank_universe
from guru_screener.models import Fundamentals, MarketData


GRAHAM_CFG = {"min_revenue": 500_000_000, "min_current_ratio": 2.0,
              "ltdebt_le_working_capital": True, "positive_eps_years": 10,
              "min_cumulative_eps_growth_10y": 0.33, "max_pe": 15.0,
              "max_pb": 1.5, "max_graham_ratio": 22.5, "net_net_variant": False}


def test_score_criteria_ignores_undecidable():
    cs = [crit("a", 10, 5, ge(5)), crit("b", None, 5, ge(5)),
          crit("c", 1, 5, ge(5))]
    # one pass, one fail decidable -> 50; the None is excluded from denominator
    assert score_criteria(cs) == 50.0


def test_score_all_undecidable_is_zero():
    assert score_criteria([crit("a", None, 5, ge(5))]) == 0.0


def test_graham_passes_classic_value():
    f = Fundamentals(ticker="X", revenue=2e9, current_ratio=2.5,
                     long_term_debt=1e8, working_capital=3e8,
                     eps=3.0, eps_history=[1, 1.2, 1.5, 1.8, 2, 2.2, 2.5, 2.7, 2.9, 3.0],
                     cumulative_eps_growth_10y=2.0)
    m = MarketData(ticker="X", price=30, pe=10.0, pb=1.2)
    res = GrahamScreen(GRAHAM_CFG).run(f, m)
    assert res.score > 80 and res.passed


def test_graham_fails_expensive():
    f = Fundamentals(ticker="X", revenue=2e9, current_ratio=1.0,
                     long_term_debt=5e8, working_capital=1e8, eps=1.0,
                     eps_history=[1] * 10, cumulative_eps_growth_10y=0.0)
    m = MarketData(ticker="X", price=100, pe=50.0, pb=8.0)
    res = GrahamScreen(GRAHAM_CFG).run(f, m)
    assert not res.passed


def test_buffett_quality():
    cfg = {"min_roe": 0.15, "roe_consistency_years": 5,
           "min_interest_coverage": 5.0, "max_debt_to_equity": 1.0,
           "require_margin_stability": True, "min_fcf_yield": 0.0,
           "require_flat_or_declining_shares": True}
    f = Fundamentals(ticker="Q", roe=0.35, roe_history=[0.3, 0.32, 0.34, 0.33, 0.35],
                     interest_coverage=20, debt_to_equity=0.4,
                     gross_margin_history=[0.5, 0.51, 0.52, 0.53, 0.54],
                     operating_margin_history=[0.2, 0.21, 0.22, 0.23, 0.24],
                     free_cash_flow=1e9, shares_history=[110, 108, 105, 102, 100])
    m = MarketData(ticker="Q", fcf_yield=0.05)
    res = BuffettScreen(cfg).run(f, m)
    assert res.passed


def test_lynch_peg_and_category():
    cfg = {"max_peg": 1.0, "fast_grower_low": 0.15, "fast_grower_high": 0.30,
           "too_hot_growth": 0.50, "max_debt_to_equity": 1.0,
           "require_positive_fcf": True}
    f = Fundamentals(ticker="G", earnings_growth=0.20, debt_to_equity=0.3,
                     free_cash_flow=5e8)
    m = MarketData(ticker="G", peg=0.8)
    res = LynchScreen(cfg).run(f, m)
    assert res.passed
    assert categorize(0.25) == "fast grower"
    assert categorize(0.6) == "too hot"


def test_greenblatt_rank_orders_by_combined():
    screen = GreenblattScreen({"exclude_sectors": ["Financials"], "top_n": 2,
                               "min_market_cap": 0})
    rows = [
        {"ticker": "A", "sector": "Tech", "market_cap": 1e9, "ey": 0.20, "roc": 0.50},
        {"ticker": "B", "sector": "Tech", "market_cap": 1e9, "ey": 0.10, "roc": 0.40},
        {"ticker": "C", "sector": "Tech", "market_cap": 1e9, "ey": 0.05, "roc": 0.10},
        {"ticker": "F", "sector": "Financials", "market_cap": 1e9, "ey": 0.9, "roc": 0.9},
    ]
    results = rank_universe(screen, rows)
    tickers = [r.ticker for r in results]
    assert "F" not in tickers                 # financials excluded
    assert results[0].ticker == "A"           # best combined rank
    assert results[0].passed and not results[-1].passed
