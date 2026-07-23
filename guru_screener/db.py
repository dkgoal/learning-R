"""Local SQLite store for metadata, cached fundamentals, holdings, and saved runs.

Design (spec §8): local-first, everything cached, every screen run reproducibly
saved with its criteria + timestamp + results. Price *time series* live in
parquet (see :mod:`guru_screener.adapters.prices`); everything else lives here.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS securities (
    ticker      TEXT PRIMARY KEY,
    cik         TEXT,
    name        TEXT,
    exchange    TEXT,
    sector      TEXT,
    industry    TEXT,
    is_adr      INTEGER DEFAULT 0,
    market_cap  REAL,
    median_dollar_volume REAL,
    updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS fundamentals (
    ticker      TEXT PRIMARY KEY,
    as_of       TEXT,
    payload     TEXT,          -- JSON blob of Fundamentals
    updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS market_data (
    ticker      TEXT PRIMARY KEY,
    payload     TEXT,          -- JSON blob of MarketData
    updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS holdings (
    manager     TEXT,
    cik         TEXT,
    quarter     TEXT,
    filing_date TEXT,
    ticker      TEXT,
    cusip       TEXT,
    issuer      TEXT,
    shares      REAL,
    value       REAL,
    pct_portfolio REAL,
    PRIMARY KEY (cik, quarter, cusip)
);
CREATE INDEX IF NOT EXISTS idx_holdings_ticker ON holdings(ticker);
CREATE INDEX IF NOT EXISTS idx_holdings_mgr ON holdings(cik, quarter);

CREATE TABLE IF NOT EXISTS runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT,
    kind        TEXT,          -- 'screen' | 'backtest'
    label       TEXT,
    criteria    TEXT,          -- JSON snapshot of thresholds used
    results     TEXT           -- JSON results payload
);

CREATE TABLE IF NOT EXISTS meta (
    key         TEXT PRIMARY KEY,
    value       TEXT
);
"""


class Store:
    """Thin wrapper around a SQLite connection with helpers per table."""

    def __init__(self, path: Path | str):
        self.path = str(path)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.executescript(SCHEMA)

    # -- lifecycle ---------------------------------------------------------
    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "Store":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    # -- securities --------------------------------------------------------
    def upsert_security(self, row: Dict[str, Any]) -> None:
        self.conn.execute(
            """INSERT INTO securities
               (ticker,cik,name,exchange,sector,industry,is_adr,market_cap,
                median_dollar_volume,updated_at)
               VALUES (:ticker,:cik,:name,:exchange,:sector,:industry,:is_adr,
                       :market_cap,:median_dollar_volume,datetime('now'))
               ON CONFLICT(ticker) DO UPDATE SET
                 cik=excluded.cik, name=excluded.name, exchange=excluded.exchange,
                 sector=excluded.sector, industry=excluded.industry,
                 is_adr=excluded.is_adr, market_cap=excluded.market_cap,
                 median_dollar_volume=excluded.median_dollar_volume,
                 updated_at=datetime('now')""",
            {**{k: None for k in
                ("cik", "name", "exchange", "sector", "industry",
                 "market_cap", "median_dollar_volume")},
             "is_adr": 0, **row},
        )
        self.conn.commit()

    def securities(self) -> List[sqlite3.Row]:
        return list(self.conn.execute("SELECT * FROM securities ORDER BY ticker"))

    def security(self, ticker: str) -> Optional[sqlite3.Row]:
        cur = self.conn.execute("SELECT * FROM securities WHERE ticker=?", (ticker,))
        return cur.fetchone()

    # -- fundamentals / market data (JSON blobs) ---------------------------
    def put_json(self, table: str, ticker: str, payload: Dict[str, Any],
                 as_of: str = "") -> None:
        if table == "fundamentals":
            self.conn.execute(
                """INSERT INTO fundamentals (ticker,as_of,payload,updated_at)
                   VALUES (?,?,?,datetime('now'))
                   ON CONFLICT(ticker) DO UPDATE SET
                     as_of=excluded.as_of, payload=excluded.payload,
                     updated_at=datetime('now')""",
                (ticker, as_of, json.dumps(payload)),
            )
        elif table == "market_data":
            self.conn.execute(
                """INSERT INTO market_data (ticker,payload,updated_at)
                   VALUES (?,?,datetime('now'))
                   ON CONFLICT(ticker) DO UPDATE SET
                     payload=excluded.payload, updated_at=datetime('now')""",
                (ticker, json.dumps(payload)),
            )
        else:
            raise ValueError(f"unknown json table: {table}")
        self.conn.commit()

    def get_json(self, table: str, ticker: str) -> Optional[Dict[str, Any]]:
        cur = self.conn.execute(
            f"SELECT payload FROM {table} WHERE ticker=?", (ticker,))
        row = cur.fetchone()
        return json.loads(row["payload"]) if row else None

    def all_json(self, table: str) -> Dict[str, Dict[str, Any]]:
        cur = self.conn.execute(f"SELECT ticker, payload FROM {table}")
        return {r["ticker"]: json.loads(r["payload"]) for r in cur}

    # -- holdings ----------------------------------------------------------
    def replace_manager_holdings(self, cik: str, quarter: str,
                                 rows: Iterable[Dict[str, Any]]) -> None:
        self.conn.execute(
            "DELETE FROM holdings WHERE cik=? AND quarter=?", (cik, quarter))
        self.conn.executemany(
            """INSERT OR REPLACE INTO holdings
               (manager,cik,quarter,filing_date,ticker,cusip,issuer,shares,value,pct_portfolio)
               VALUES (:manager,:cik,:quarter,:filing_date,:ticker,:cusip,:issuer,
                       :shares,:value,:pct_portfolio)""",
            list(rows),
        )
        self.conn.commit()

    def holdings_for_ticker(self, ticker: str, quarter: Optional[str] = None
                            ) -> List[sqlite3.Row]:
        if quarter:
            cur = self.conn.execute(
                "SELECT * FROM holdings WHERE ticker=? AND quarter=?",
                (ticker, quarter))
        else:
            cur = self.conn.execute(
                "SELECT * FROM holdings WHERE ticker=?", (ticker,))
        return list(cur)

    def holdings_for_manager(self, cik: str, quarter: str) -> List[sqlite3.Row]:
        cur = self.conn.execute(
            "SELECT * FROM holdings WHERE cik=? AND quarter=? ORDER BY value DESC",
            (cik, quarter))
        return list(cur)

    def manager_quarters(self, cik: str) -> List[str]:
        cur = self.conn.execute(
            "SELECT DISTINCT quarter FROM holdings WHERE cik=? ORDER BY quarter DESC",
            (cik,))
        return [r["quarter"] for r in cur]

    def all_quarters(self) -> List[str]:
        cur = self.conn.execute(
            "SELECT DISTINCT quarter FROM holdings ORDER BY quarter DESC")
        return [r["quarter"] for r in cur]

    # -- saved runs --------------------------------------------------------
    def save_run(self, kind: str, label: str, criteria: Dict[str, Any],
                 results: Any) -> int:
        cur = self.conn.execute(
            """INSERT INTO runs (created_at,kind,label,criteria,results)
               VALUES (datetime('now'),?,?,?,?)""",
            (kind, label, json.dumps(criteria), json.dumps(results)),
        )
        self.conn.commit()
        return int(cur.lastrowid)

    def list_runs(self, limit: int = 50) -> List[sqlite3.Row]:
        cur = self.conn.execute(
            "SELECT id,created_at,kind,label FROM runs ORDER BY id DESC LIMIT ?",
            (limit,))
        return list(cur)

    def get_run(self, run_id: int) -> Optional[sqlite3.Row]:
        cur = self.conn.execute("SELECT * FROM runs WHERE id=?", (run_id,))
        return cur.fetchone()

    # -- meta --------------------------------------------------------------
    def set_meta(self, key: str, value: str) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)", (key, value))
        self.conn.commit()

    def get_meta(self, key: str) -> Optional[str]:
        cur = self.conn.execute("SELECT value FROM meta WHERE key=?", (key,))
        row = cur.fetchone()
        return row["value"] if row else None


def open_store(cache_directory: Path | str, name: str = "guru.db") -> Store:
    """Open (creating if needed) the SQLite store inside the cache directory."""
    Path(cache_directory).mkdir(parents=True, exist_ok=True)
    return Store(Path(cache_directory) / name)
