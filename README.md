# Guru Stock Screener

A personal, local, single-user desktop application that screens US-listed
equities **two ways at once**:

1. **Philosophy screens** — codified pass/fail filters that approximate how
   legendary investors (Graham, Buffett, Lynch, Greenblatt) pick stocks.
2. **13F holdings overlay** — the *actual* current equity holdings a curated
   roster of managers disclose to the SEC, layered onto the screen.

> The gap between the two is itself signal: a name that *passes* Buffett's
> screen but that Buffett *doesn't own* is a different idea than one he holds.

Implements the requirements spec v0.1. Personal use only — **not investment
advice**.

---

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 1) Populate an offline DEMO dataset (no network needed) and explore:
python -m guru_screener seed
python -m guru_screener            # opens the desktop app (or a browser tab)

# 2) …or pull LIVE data on your machine (edit your SEC User-Agent first, see below):
python -m guru_screener refresh
```

Other commands:

| Command | What it does |
|---|---|
| `python -m guru_screener` | Launch desktop app (pywebview window; falls back to browser) |
| `python -m guru_screener serve` | Run the web server only at `http://127.0.0.1:8765` |
| `python -m guru_screener seed` | Populate the offline demo cache |
| `python -m guru_screener refresh [--stale]` | Live refresh from SEC EDGAR + price sources (`--stale` = only sources past their TTL) |
| `python -m guru_screener schedule [--interval S] [--once]` | Run stale-only refresh on a loop (keeps the cache current) |
| `python -m guru_screener backup [--out PATH] [--restore PATH]` | Snapshot / restore the local cache |
| `python -m guru_screener screen [--csv] [--top N]` | Print / export the screen to stdout |
| `python -m guru_screener resolve NAME` | Look up a filer CIK on EDGAR (live) |
| `pytest` | Run the test suite (28 tests; uses the demo dataset) |

> **Note on this sandbox:** SEC egress is blocked here, so live `refresh` won't
> reach `sec.gov` from the build environment. The demo seeder produces a full,
> working dataset offline; live refresh works on your own machine.

---

## What's in the app

- **Screener table** (`/`) — every cached name with per-philosophy scores, a
  composite score, guru-ownership chips, and NEW-BUY badges. Sort/filter client-side.
- **Stock scorecard** (`/stock/AAPL`) — every criterion that drove each screen,
  with the raw value and threshold (full transparency — no black boxes), plus
  the 13F ownership detail.
- **Managers** (`/managers`, `/manager/<key>`) — the roster and each manager's
  holdings sorted by weight, with the quarter-over-quarter diff (new / add /
  trim / exit) and the filing date so the ~45-day 13F lag is always visible.
- **Light backtest** (`/backtest`) — an equal-weight basket from a chosen screen
  "as of" a past date vs SPY, at 1/3/6/12 months. **Labelled approximate — not
  point-in-time** (see caveats below).
- **Settings** (`/settings`) — tune every screen threshold; saved back to
  `config/settings.yaml`.
- **CSV export** (`/export.csv`).

---

## Production install (running it for real)

This is a personal, local desktop app — "production" means a reliable install on
your own machine on live data, not a server. Recommended path:

**1. Live data.** Set a descriptive SEC `User-Agent` with your email in the
config (`app.sec_user_agent`), verify the guru CIKs, then pull data:

```bash
python -m guru_screener resolve "Baupost"     # confirm each overlay-only CIK
python -m guru_screener refresh               # first full pull
```

**2. Freeze a standalone app** (no Python/venv needed to run it):

```bash
./packaging/build.sh          # installs pyinstaller + pywebview, produces dist/guru-screener/
./dist/guru-screener/guru-screener            # double-clickable desktop app
```

The frozen build reads its bundled defaults but stores **config + cache in
`~/.guru-screener/`** (override with `GURU_HOME`), so the app itself stays
read-only and your data/settings persist across upgrades.

**3. Keep the cache current.** Either leave the built-in scheduler running:

```bash
python -m guru_screener schedule              # hourly stale-only checks
```

…or drive it from your OS scheduler (preferred for set-and-forget):

```cron
# crontab -e  — prices daily, SEC pulls only when a quarter ages out (TTL-gated)
0 6 * * *  cd /path/to/app && ./dist/guru-screener/guru-screener refresh --stale
```

On macOS use a launchd agent; on Windows use Task Scheduler — same command.
Refresh cadence is governed by `data.ttl` (prices 1 day, fundamentals/13F 90
days); `--stale` skips anything still within its TTL.

**4. Pin deps and back up.** Install from the lockfile for reproducibility, and
snapshot the cache before big refreshes:

```bash
pip install -r requirements.lock.txt
python -m guru_screener backup                # -> guru-cache-backup-<timestamp>.zip
python -m guru_screener backup --restore <archive.zip>
```

### CUSIP → ticker resolution (13F data quality)

13F filings identify positions by CUSIP, and there is no clean free CUSIP→ticker
source — this is the overlay's main limitation. The app resolves best-effort:
**overrides file → cached map → issuer-name match** against the SEC universe.
Unresolved positions show by issuer name without an ownership badge. Fill the
gaps that matter to you in `config/cusip_overrides.csv` (`cusip,ticker`); find a
position's CUSIP in the manager's 13F on EDGAR or in the app's stock-detail
overlay table.

---

## Architecture (spec §9)

```
data adapters  ->  factor engine  ->  scoring  ->  13F overlay  ->  UI
```

Each layer is swappable and depends only on the layer interface, so a flaky free
data provider can be replaced without touching screening logic.

```
guru_screener/
  config.py            settings load/save
  paths.py             dev vs. installed/frozen path resolution (writable user home)
  models.py            typed structures passed between layers
  db.py                SQLite store (metadata, fundamentals, holdings, cusip map, runs)
  cusip.py             CUSIP -> ticker resolver (overrides / cache / name-match)
  adapters/
    base.py            PriceAdapter / FundamentalsAdapter / HoldingsAdapter interfaces
    sec_edgar.py       companyfacts (XBRL) fundamentals + 13F-HR parsing + CIK map
    prices.py          EOD prices, Stooq->yfinance fallback chain, parquet cache
    http.py            polite, rate-limited HTTP with SEC User-Agent
  factors/             graham / buffett / lynch / greenblatt screens + registry
  scoring.py           composite scorecard + ranking
  holdings/            roster (with CIKs) + overlay / QoQ diff
  pipeline.py          orchestration: cache -> market data -> screens -> scorecard
  refresh.py           the ONLY module that hits the network (TTL-gated ingestion)
  scheduler.py         stale-only auto-refresh loop
  backup.py            zip / restore the local cache
  backtest.py          light, caveated backtest
  export.py            CSV
  web/                 Flask app + templates + static (data-dense tables)
  demo/seed.py         offline synthetic dataset (30 well-known tickers)
config/settings.yaml   all tunable thresholds + open-question decisions
config/cusip_overrides.csv   manual CUSIP -> ticker overrides
packaging/             PyInstaller spec + build script for a standalone app
```

**Storage (spec §8):** SQLite for metadata/fundamentals/holdings/saved runs;
parquet for cached price time series. App runs offline against the cache;
refresh is on-demand. Screening never touches the network.

---

## Decisions on the spec's open questions (§10)

These are the defaults shipped; all are **editable** (mostly in
`config/settings.yaml` or `holdings/roster.py`).

1. **Roster** — adopted the proposed 12-name roster as-is (§6.2). Graham & Lynch
   are historical (screen-only); Buffett & Greenblatt are screen **and** overlay;
   Klarman, Pabrai, Akre, Li Lu, Terry Smith are overlay (mapped to a screen
   affinity for the gap signal); Ackman, Einhorn, Burry are **overlay-only**.
   Edit `guru_screener/holdings/roster.py` to cut / add / reclassify.
2. **Thresholds** — adopted the §6.1 recommended defaults. Tune any of them in
   Settings; they're plain YAML.
3. **ADRs** — **included** and flagged (`universe.include_adrs: true`).
4. **Universe floor** — `$50M` market cap / `$500K` median daily dollar volume.
5. **Desktop shell** — **pywebview-wrapped web UI** (recommended), with an
   automatic fallback to opening the default browser so it runs everywhere.
6. **Priority** — screens built first, then the 13F overlay; both are complete.

### Guru CIKs

The roster ships best-known SEC CIKs so the live overlay works out of the box.
A wrong CIK simply yields no holdings for that manager (the app degrades
gracefully). Verify/override any of them with:

```bash
python -m guru_screener resolve "Berkshire Hathaway"
```

Buffett/Berkshire's CIK is verified; others are marked `cik_verified=False` in
`roster.py` and worth confirming before relying on the overlay for them.

---

## Screen definitions (spec §6.1)

- **Graham — Defensive Value:** size, current ratio ≥ 2, LT debt ≤ working
  capital, positive EPS every year, cumulative EPS growth, P/E ≤ 15, P/B ≤ 1.5,
  Graham number (P/E × P/B ≤ 22.5), optional net-net variant.
- **Buffett — Quality/Moat:** ROE ≥ 15% & consistent, interest coverage ≥ 5×,
  modest debt, stable/expanding margins (moat proxy), positive FCF & FCF yield,
  flat/declining share count.
- **Lynch — GARP:** PEG ≤ 1.0 (weighted 2×), growth in the 15–30% fast-grower
  band (>50% flagged too hot), manageable debt, positive FCF, category tag.
- **Greenblatt — Magic Formula:** rank the universe by earnings yield (EBIT/EV)
  and return on capital, combine ranks, exclude financials & utilities, take top-N.

Each screen returns a 0–100 score = weighted share of *decidable* criteria met.
Criteria with missing data are shown but excluded from the denominator (so data
gaps are visible, not silently scored as failures).

---

## Data sources (all free — spec §5)

| Need | Source |
|---|---|
| 13F holdings | SEC EDGAR (13F-HR submissions + information table XML) |
| Fundamentals | SEC EDGAR `companyfacts` / XBRL API |
| CIK ↔ ticker | SEC `company_tickers.json` |
| Prices (EOD) | Stooq (primary) → yfinance (fallback) → cache |

**Before a live refresh, set a descriptive SEC `User-Agent`** with your contact
email in `config/settings.yaml` (`app.sec_user_agent`). SEC requires it and asks
callers to stay well under 10 req/s; the app rate-limits and caches to comply.

---

## Light backtest — read this (spec §7)

The backtest is **directional sanity-checking, not validated performance**.
Every result is labelled and carries these caveats:

- Approximate — **NOT point-in-time**. It uses *today's* fundamentals, not those
  known at the as-of date (look-ahead bias).
- Survivorship bias: delisted tickers vanish from free price history.
- 13F overlays are ~45 days lagged.
- No transaction costs, taxes, or slippage.

Basket composition is always shown so results are inspectable.

---

## Out of scope (v1)

Real-time/intraday data, multi-user/cloud, brokerage/execution, options/fixed
income/crypto/non-US, institutional point-in-time backtesting, and black-box
quant strategies that can't be expressed as fundamental filters.
