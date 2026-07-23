"""Flask application factory and routes.

Thin layer over the pipeline/overlay/backtest services. Renders data-dense
tables (the reason for a web UI per spec §9) and exposes JSON + CSV endpoints.
Runs standalone in a browser or wrapped as a desktop window by pywebview.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from flask import (Flask, Response, jsonify, redirect, render_template,
                   request, url_for)

from .. import __version__
from ..adapters.http import HttpClient
from ..adapters.prices import PriceService
from ..backtest import run_backtest
from ..config import cache_dir, deep_merge, load_config, save_config
from ..db import open_store
from ..export import scorecards_to_csv
from ..factors import build_screens
from ..factors.greenblatt import GreenblattScreen
from ..holdings.overlay import manager_view, overlay_for_ticker
from ..holdings.roster import ROSTER, ROSTER_BY_KEY
from ..pipeline import (compute_market_data, load_fundamentals,
                        price_lookup_from_cache, run_screening)


def create_app(config: Optional[Dict[str, Any]] = None) -> Flask:
    app = Flask(__name__)
    app.config["GURU"] = config or load_config()

    # Template helpers for compact, safe value formatting.
    @app.template_global()
    def fmt(v: Any) -> str:
        if v is None:
            return ""
        if isinstance(v, float):
            if abs(v) >= 1e9:
                return f"{v/1e9:.1f}B"
            if abs(v) >= 1e6:
                return f"{v/1e6:.1f}M"
            return f"{v:.2f}"
        return str(v)

    @app.template_global()
    def pct(v: Any) -> str:
        return "—" if v is None else f"{v*100:+.1f}%"

    def services():
        cfg = app.config["GURU"]
        cache = cache_dir(cfg)
        store = open_store(cache)
        http = HttpClient(cfg["app"]["sec_user_agent"])
        prices = PriceService(http, cache, cfg["data"].get("price_provider_order"))
        return cfg, store, prices

    def current_quarter(store) -> Optional[str]:
        return store.get_meta("current_quarter") or (
            store.all_quarters()[0] if store.all_quarters() else None)

    def scorecards(cfg, store, prices) -> List[Dict[str, Any]]:
        tickers = [s["ticker"] for s in store.securities()]
        px = price_lookup_from_cache(store, prices, tickers)
        return run_screening(store, cfg, px, current_quarter(store))

    # -- pages -------------------------------------------------------------
    @app.route("/")
    def index():
        cfg, store, prices = services()
        rows = scorecards(cfg, store, prices)
        seeded = store.get_meta("demo_seeded") == "1"
        q = current_quarter(store)
        store.close()
        return render_template(
            "index.html", rows=rows, cfg=cfg, version=__version__,
            demo=seeded, quarter=q, roster=ROSTER,
            screen_keys=[s.key for s in build_screens(cfg)])

    @app.route("/stock/<ticker>")
    def stock(ticker: str):
        ticker = ticker.upper()
        cfg, store, prices = services()
        sec = store.security(ticker)
        f = load_fundamentals(store, ticker)
        if sec is None or f is None:
            store.close()
            return render_template("missing.html", ticker=ticker, cfg=cfg), 404
        px = price_lookup_from_cache(store, prices, [ticker]).get(ticker)
        m = compute_market_data(f, px)
        screens = build_screens(cfg)
        results = {}
        for s in screens:
            if isinstance(s, GreenblattScreen):
                results[s.key] = s.run(f, m)  # criteria only; rank shown on list
            else:
                results[s.key] = s.run(f, m)
        overlay = overlay_for_ticker(store, ticker, current_quarter(store))
        store.close()
        return render_template("stock.html", ticker=ticker, sec=sec, f=f, m=m,
                               results=results, overlay=overlay, cfg=cfg)

    @app.route("/managers")
    def managers():
        cfg, store, prices = services()
        summary = []
        for g in ROSTER:
            n = len(store.holdings_for_manager(g.cik, current_quarter(store))) \
                if g.cik else 0
            summary.append({"guru": g, "n_positions": n})
        store.close()
        return render_template("managers.html", summary=summary, cfg=cfg)

    @app.route("/manager/<key>")
    def manager(key: str):
        cfg, store, prices = services()
        if key not in ROSTER_BY_KEY:
            store.close()
            return redirect(url_for("managers"))
        q = request.args.get("quarter")
        view = manager_view(store, key, q)
        store.close()
        return render_template("manager.html", view=view, cfg=cfg,
                               guru=ROSTER_BY_KEY[key])

    @app.route("/backtest", methods=["GET", "POST"])
    def backtest():
        cfg, store, prices = services()
        result = None
        screen_key = request.form.get("screen", "graham")
        as_of = request.form.get("as_of", "2024-06-28")
        if request.method == "POST":
            rows = scorecards(cfg, store, prices)
            selected = [r["ticker"] for r in rows
                        if r.get(f"{screen_key}_pass")]
            result = run_backtest(prices, selected, as_of, cfg,
                                  cfg["backtest"]["benchmark"])
        keys = [s.key for s in build_screens(cfg)]
        store.close()
        return render_template("backtest.html", cfg=cfg, result=result,
                               screen_keys=keys, screen_key=screen_key,
                               as_of=as_of)

    @app.route("/settings", methods=["GET", "POST"])
    def settings():
        cfg = app.config["GURU"]
        if request.method == "POST":
            patch = _parse_settings_form(request.form)
            cfg = deep_merge(cfg, patch)
            save_config(cfg)
            app.config["GURU"] = cfg
            return redirect(url_for("settings"))
        return render_template("settings.html", cfg=cfg)

    # -- api / export ------------------------------------------------------
    @app.route("/api/screen")
    def api_screen():
        cfg, store, prices = services()
        rows = scorecards(cfg, store, prices)
        store.close()
        return jsonify(rows)

    @app.route("/export.csv")
    def export_csv():
        cfg, store, prices = services()
        rows = scorecards(cfg, store, prices)
        store.close()
        csv_text = scorecards_to_csv(rows)
        return Response(csv_text, mimetype="text/csv", headers={
            "Content-Disposition": "attachment; filename=guru_screen.csv"})

    @app.route("/api/refresh", methods=["POST"])
    def api_refresh():
        """Trigger a live refresh (no-op-safe; reports errors as JSON)."""
        from ..refresh import refresh_all
        cfg = app.config["GURU"]
        try:
            limit = int(request.form.get("limit", 0)) or None
            counts = refresh_all(cfg, universe_limit=limit)
            return jsonify({"ok": True, "counts": counts})
        except Exception as exc:  # network blocked / provider down
            return jsonify({"ok": False, "error": str(exc)}), 502

    return app


def _parse_settings_form(form) -> Dict[str, Any]:
    """Convert flat 'section.sub.key' form fields into a nested patch dict."""
    patch: Dict[str, Any] = {}
    for field, raw in form.items():
        if not field.startswith("cfg."):
            continue
        path = field[4:].split(".")
        node = patch
        for p in path[:-1]:
            node = node.setdefault(p, {})
        node[path[-1]] = _coerce(raw)
    return patch


def _coerce(raw: str):
    low = raw.strip().lower()
    if low in ("true", "false"):
        return low == "true"
    try:
        return int(raw)
    except ValueError:
        pass
    try:
        return float(raw)
    except ValueError:
        return raw
