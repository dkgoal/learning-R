"""Adapter interfaces.

These abstract base classes define the contract every data source must satisfy.
The rest of the app depends only on these interfaces, never on a concrete
provider — so swapping Stooq for yfinance, or a live SEC pull for a fixture, is
a one-line change in the pipeline.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Dict, List, Optional

import pandas as pd

from ..models import Fundamentals, Holding, SecurityMeta


class UniverseAdapter(ABC):
    """Provides the investable universe: ticker <-> CIK mapping + listings."""

    @abstractmethod
    def list_securities(self) -> List[SecurityMeta]:
        ...


class FundamentalsAdapter(ABC):
    """Provides per-company fundamental metrics."""

    @abstractmethod
    def fundamentals(self, meta: SecurityMeta) -> Optional[Fundamentals]:
        ...


class PriceAdapter(ABC):
    """Provides EOD price history for a ticker."""

    name: str = "price"

    @abstractmethod
    def history(self, ticker: str, lookback_days: int = 400
                ) -> Optional[pd.DataFrame]:
        """Return a DataFrame indexed by date with at least a 'close' column."""
        ...


class HoldingsAdapter(ABC):
    """Provides 13F holdings for a manager CIK."""

    @abstractmethod
    def latest_holdings(self, cik: str, manager: str) -> List[Holding]:
        ...

    @abstractmethod
    def holdings_for_quarter(self, cik: str, manager: str, quarter: str
                             ) -> List[Holding]:
        ...


class AdapterError(RuntimeError):
    """Raised when a provider fails; the pipeline catches and falls back."""
