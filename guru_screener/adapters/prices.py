"""EOD price adapters with a provider fallback chain + parquet cache.

Free price sources are fragile (spec §5). We therefore:
* wrap each provider behind :class:`PriceAdapter`,
* try them in configured order and use the first that returns data,
* cache each ticker's history to parquet (falls back to SQLite-free CSV if
  pyarrow is unavailable) so the app runs offline against cache.

Providers implemented:
* ``StooqAdapter``   — CSV over HTTPS, no key required.
* ``YFinanceAdapter``— optional; only used if the ``yfinance`` package is present.
"""
from __future__ import annotations

import io
from pathlib import Path
from typing import List, Optional

import pandas as pd

from .base import PriceAdapter
from .http import HttpClient

STOOQ_URL = "https://stooq.com/q/d/l/"


class StooqAdapter(PriceAdapter):
    name = "stooq"

    def __init__(self, http: HttpClient):
        self.http = http

    def history(self, ticker: str, lookback_days: int = 400
                ) -> Optional[pd.DataFrame]:
        # Stooq uses lowercase and a .us suffix for US listings.
        sym = f"{ticker.lower()}.us"
        try:
            text = self.http.get_text(STOOQ_URL, params={"s": sym, "i": "d"})
        except Exception:
            return None
        if not text or text.startswith("<") or "No data" in text:
            return None
        try:
            df = pd.read_csv(io.StringIO(text))
        except Exception:
            return None
        if "Close" not in df.columns or df.empty:
            return None
        df = df.rename(columns=str.lower)
        df["date"] = pd.to_datetime(df["date"])
        df = df.set_index("date").sort_index()
        return df[["close", "volume"]].tail(lookback_days)


class YFinanceAdapter(PriceAdapter):
    name = "yfinance"

    def history(self, ticker: str, lookback_days: int = 400
                ) -> Optional[pd.DataFrame]:
        try:
            import yfinance as yf  # optional dependency
        except ImportError:
            return None
        try:
            data = yf.Ticker(ticker).history(period="2y", auto_adjust=False)
        except Exception:
            return None
        if data is None or data.empty:
            return None
        data = data.rename(columns=str.lower)
        data.index = pd.to_datetime(data.index).tz_localize(None)
        return data[["close", "volume"]].tail(lookback_days)


_ADAPTERS = {"stooq": StooqAdapter, "yfinance": YFinanceAdapter}


class PriceService:
    """Fallback chain + parquet cache in front of the price adapters."""

    def __init__(self, http: HttpClient, cache_dir: Path,
                 provider_order: Optional[List[str]] = None):
        self.cache_dir = Path(cache_dir) / "prices"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        order = provider_order or ["stooq", "yfinance"]
        self.adapters: List[PriceAdapter] = []
        for name in order:
            cls = _ADAPTERS.get(name)
            if cls is None:
                continue
            self.adapters.append(cls(http) if name == "stooq" else cls())

    def _cache_path(self, ticker: str) -> Path:
        return self.cache_dir / f"{ticker.upper()}.parquet"

    def read_cache(self, ticker: str) -> Optional[pd.DataFrame]:
        p = self._cache_path(ticker)
        if not p.exists():
            return None
        try:
            return pd.read_parquet(p)
        except Exception:
            return None

    def write_cache(self, ticker: str, df: pd.DataFrame) -> None:
        try:
            df.to_parquet(self._cache_path(ticker))
        except Exception:
            # pyarrow missing / write error: fall back to CSV alongside.
            df.to_csv(self._cache_path(ticker).with_suffix(".csv"))

    def history(self, ticker: str, lookback_days: int = 400,
                refresh: bool = False) -> Optional[pd.DataFrame]:
        if not refresh:
            cached = self.read_cache(ticker)
            if cached is not None and not cached.empty:
                return cached.tail(lookback_days)
        for adapter in self.adapters:
            df = adapter.history(ticker, lookback_days)
            if df is not None and not df.empty:
                self.write_cache(ticker, df)
                return df
        return self.read_cache(ticker)  # last resort: stale cache if any

    def latest_price(self, ticker: str) -> Optional[float]:
        df = self.history(ticker)
        if df is None or df.empty:
            return None
        return float(df["close"].iloc[-1])

    def median_dollar_volume(self, ticker: str, window: int = 60
                             ) -> Optional[float]:
        df = self.history(ticker)
        if df is None or df.empty or "volume" not in df:
            return None
        tail = df.tail(window)
        dv = (tail["close"] * tail["volume"]).median()
        return float(dv) if pd.notna(dv) else None
