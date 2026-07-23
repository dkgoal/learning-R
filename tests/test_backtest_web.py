"""Backtest, export, and web smoke tests."""
from guru_screener.backtest import run_backtest, CAVEATS
from guru_screener.export import scorecards_to_csv, COLUMNS
from guru_screener.web.app import create_app


def test_backtest_returns_summary_and_caveats(price_service, cfg):
    res = run_backtest(price_service, ["LEN", "DHI", "CROX"], "2024-06-28", cfg)
    assert res["basket_size"] == 3
    assert set(res["caveats"]) == set(CAVEATS)
    for h in ("1", "3", "6", "12"):
        assert h in res["summary"]
        assert res["summary"][h]["n_priced"] >= 1


def test_backtest_empty_basket_is_safe(price_service, cfg):
    res = run_backtest(price_service, [], "2024-06-28", cfg)
    assert res["basket_size"] == 0
    assert res["summary"]["1"]["basket_return"] is None


def test_csv_export_header_and_rows():
    rows = [{"ticker": "AAA", "name": "Test", "composite": 88.0,
             "passes": ["graham", "buffett"], "guru_holders": ["Warren Buffett"]}]
    csv = scorecards_to_csv(rows)
    lines = csv.strip().splitlines()
    assert lines[0] == ",".join(COLUMNS)
    assert "AAA" in lines[1]
    assert "graham; buffett" in lines[1]        # list joined


def test_web_routes(cfg):
    app = create_app(cfg)
    c = app.test_client()
    assert c.get("/").status_code == 200
    assert c.get("/stock/AAPL").status_code == 200
    assert c.get("/stock/NOPE").status_code == 404
    assert c.get("/managers").status_code == 200
    assert c.get("/manager/buffett").status_code == 200
    assert c.get("/api/screen").status_code == 200
    assert c.get("/export.csv").status_code == 200
    assert c.post("/backtest", data={"screen": "graham",
                                     "as_of": "2024-06-28"}).status_code == 200
