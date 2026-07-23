"""Typed data structures passed between layers.

These are deliberately lightweight dataclasses so every layer speaks the same
language and every score can be traced back to raw values (spec §8 transparency).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class SecurityMeta:
    """Identity + universe attributes for one listed security."""
    ticker: str
    cik: Optional[str] = None
    name: str = ""
    exchange: str = ""
    sector: str = ""
    industry: str = ""
    is_adr: bool = False
    market_cap: Optional[float] = None
    median_dollar_volume: Optional[float] = None


@dataclass
class Fundamentals:
    """A flat bag of the fundamental metrics screens consume.

    All values are annual/trailing and pre-computed by the factor engine's
    metrics module from raw XBRL facts. ``None`` means "unknown / not reported"
    and screens treat unknown as a failed criterion (conservative).
    """
    ticker: str
    as_of: str = ""                       # ISO date the fundamentals reflect
    revenue: Optional[float] = None
    net_income: Optional[float] = None
    eps: Optional[float] = None
    eps_history: List[float] = field(default_factory=list)   # oldest -> newest
    current_ratio: Optional[float] = None
    long_term_debt: Optional[float] = None
    working_capital: Optional[float] = None
    total_debt: Optional[float] = None
    total_equity: Optional[float] = None
    debt_to_equity: Optional[float] = None
    interest_coverage: Optional[float] = None
    roe: Optional[float] = None
    roe_history: List[float] = field(default_factory=list)
    roic: Optional[float] = None
    roa: Optional[float] = None
    gross_margin: Optional[float] = None
    gross_margin_history: List[float] = field(default_factory=list)
    operating_margin: Optional[float] = None
    operating_margin_history: List[float] = field(default_factory=list)
    ebit: Optional[float] = None
    free_cash_flow: Optional[float] = None
    shares_outstanding: Optional[float] = None
    shares_history: List[float] = field(default_factory=list)
    book_value: Optional[float] = None
    ncav: Optional[float] = None           # net current asset value
    net_working_capital: Optional[float] = None
    net_fixed_assets: Optional[float] = None
    earnings_growth: Optional[float] = None   # forward/est annual growth rate
    cumulative_eps_growth_10y: Optional[float] = None


@dataclass
class MarketData:
    """Price-derived quantities."""
    ticker: str
    price: Optional[float] = None
    pe: Optional[float] = None
    pb: Optional[float] = None
    peg: Optional[float] = None
    enterprise_value: Optional[float] = None
    fcf_yield: Optional[float] = None
    earnings_yield: Optional[float] = None    # EBIT/EV (Magic Formula)
    as_of: str = ""


@dataclass
class Criterion:
    """One pass/fail check within a screen, with the raw value that decided it."""
    name: str
    passed: Optional[bool]        # None = insufficient data
    value: Any = None
    threshold: Any = None
    weight: float = 1.0
    note: str = ""


@dataclass
class ScreenResult:
    """Outcome of running one philosophy screen on one stock."""
    screen: str
    ticker: str
    score: float                          # 0..100, weighted share of criteria met
    passed: bool                          # meets the screen's pass bar
    criteria: List[Criterion] = field(default_factory=list)
    rank: Optional[int] = None            # for rank-based screens (Magic Formula)
    note: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "screen": self.screen,
            "ticker": self.ticker,
            "score": round(self.score, 1),
            "passed": self.passed,
            "rank": self.rank,
            "criteria": [c.__dict__ for c in self.criteria],
            "note": self.note,
        }


@dataclass
class Holding:
    """One line of a 13F filing."""
    manager: str
    cik: str
    ticker: Optional[str]
    cusip: str
    issuer: str
    shares: float
    value: float                # USD, as reported (thousands normalized to $)
    pct_portfolio: float = 0.0
    quarter: str = ""           # e.g. "2024Q1"
    filing_date: str = ""


@dataclass
class HoldingDiff:
    """Quarter-over-quarter change for one manager/ticker."""
    manager: str
    ticker: str
    action: str                 # new / add / trim / exit / hold
    shares_prev: float
    shares_now: float
    value_now: float
    pct_portfolio: float
