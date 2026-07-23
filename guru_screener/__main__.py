"""Command-line entry point.

Usage:
    python -m guru_screener            # launch the desktop app (pywebview or browser)
    python -m guru_screener serve      # run the web server only (no window)
    python -m guru_screener seed       # populate the offline demo cache
    python -m guru_screener refresh     # live refresh from SEC + price sources
    python -m guru_screener resolve NAME  # look up a filer CIK on EDGAR (live)
    python -m guru_screener screen [--csv]  # print/export the screen to stdout

The desktop shell tries ``pywebview`` for a native window and falls back to
opening the default browser, so the app runs anywhere.
"""
from __future__ import annotations

import argparse
import sys
import threading
import time
from typing import List, Optional
from wsgiref.simple_server import make_server

from .config import load_config
from .web.app import create_app

HOST = "127.0.0.1"
PORT = 8765


def _serve_background(app) -> "object":
    server = make_server(HOST, PORT, app)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server


def cmd_serve(args) -> int:
    app = create_app(load_config())
    print(f"Guru Stock Screener running at http://{HOST}:{PORT}  (Ctrl-C to stop)")
    app.run(host=HOST, port=PORT, debug=args.debug)
    return 0


def cmd_desktop(args) -> int:
    app = create_app(load_config())
    server = _serve_background(app)
    url = f"http://{HOST}:{PORT}"
    time.sleep(0.4)
    try:
        import webview  # pywebview, optional
        window = webview.create_window("Guru Stock Screener", url,
                                       width=1400, height=900)
        webview.start()
        return 0
    except Exception:
        import webbrowser
        print(f"pywebview unavailable — opening in browser: {url}")
        webbrowser.open(url)
        print("Server running. Press Ctrl-C to stop.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            server.shutdown()
        return 0


def cmd_seed(args) -> int:
    from .demo.seed import seed
    store = seed(load_config())
    n = len(store.securities())
    store.close()
    print(f"Seeded demo cache: {n} securities, "
          f"holdings for the overlay roster. Run 'python -m guru_screener' to view.")
    return 0


def cmd_refresh(args) -> int:
    from .refresh import refresh_all
    cfg = load_config()
    print("Live refresh from SEC EDGAR + price sources...")
    print(f"(Set app.sec_user_agent in config/settings.yaml first — currently: "
          f"{cfg['app']['sec_user_agent']})")
    try:
        counts = refresh_all(cfg, log=lambda m: print(m),
                             universe_limit=args.limit)
        print("Done:", counts)
        return 0
    except Exception as exc:
        print(f"Refresh failed: {exc}", file=sys.stderr)
        return 1


def cmd_resolve(args) -> int:
    """Best-effort live CIK lookup via SEC's company_tickers reference."""
    from .adapters.http import HttpClient
    from .adapters.sec_edgar import SecUniverseAdapter
    cfg = load_config()
    http = HttpClient(cfg["app"]["sec_user_agent"])
    try:
        secs = SecUniverseAdapter(http).list_securities()
    except Exception as exc:
        print(f"Lookup failed: {exc}", file=sys.stderr)
        return 1
    needle = args.name.lower()
    hits = [s for s in secs if needle in s.name.lower() or needle == s.ticker.lower()]
    for s in hits[:20]:
        print(f"CIK {int(s.cik):010d}  {s.ticker:8s}  {s.name}")
    if not hits:
        print("No match. Note: 13F filers (funds) may not appear in the ticker file; "
              "use EDGAR full-text search at https://efts.sec.gov/LATEST/search-index?q=")
    return 0


def cmd_screen(args) -> int:
    from .adapters.http import HttpClient
    from .adapters.prices import PriceService
    from .config import cache_dir
    from .db import open_store
    from .export import scorecards_to_csv
    from .pipeline import price_lookup_from_cache, run_screening
    cfg = load_config()
    cache = cache_dir(cfg)
    store = open_store(cache)
    prices = PriceService(HttpClient("cli"), cache,
                          cfg["data"].get("price_provider_order"))
    tickers = [s["ticker"] for s in store.securities()]
    if not tickers:
        print("Cache is empty. Run 'seed' (demo) or 'refresh' (live) first.",
              file=sys.stderr)
        store.close()
        return 1
    px = price_lookup_from_cache(store, prices, tickers)
    q = store.get_meta("current_quarter")
    rows = run_screening(store, cfg, px, q)
    store.close()
    if args.csv:
        sys.stdout.write(scorecards_to_csv(rows))
    else:
        print(f"{'TICKER':8s} {'COMP':>6s} {'PASSES':>7s} {'GURUS':>6s}  HELD BY")
        for r in rows[:args.top]:
            held = ", ".join(g.split()[-1] for g in r["guru_holders"])
            print(f"{r['ticker']:8s} {r['composite']:6.1f} "
                  f"{r['n_passes']:>7d} {r['n_gurus']:>6d}  {held}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="guru_screener",
                                description="Guru Stock Screener")
    sub = p.add_subparsers(dest="cmd")

    d = sub.add_parser("desktop", help="launch desktop app (default)")
    d.set_defaults(func=cmd_desktop)

    s = sub.add_parser("serve", help="run web server only")
    s.add_argument("--debug", action="store_true")
    s.set_defaults(func=cmd_serve)

    sd = sub.add_parser("seed", help="populate offline demo cache")
    sd.set_defaults(func=cmd_seed)

    r = sub.add_parser("refresh", help="live refresh from data sources")
    r.add_argument("--limit", type=int, default=None,
                   help="cap universe size (for a quick partial refresh)")
    r.set_defaults(func=cmd_refresh)

    rs = sub.add_parser("resolve", help="look up a filer CIK on EDGAR")
    rs.add_argument("name")
    rs.set_defaults(func=cmd_resolve)

    sc = sub.add_parser("screen", help="print/export the screen")
    sc.add_argument("--csv", action="store_true")
    sc.add_argument("--top", type=int, default=30)
    sc.set_defaults(func=cmd_screen)
    return p


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        args = parser.parse_args((argv or []) + ["desktop"])
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
