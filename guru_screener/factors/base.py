"""Screen base class and shared helpers.

A screen collects :class:`Criterion` results and derives a weighted 0..100 score
= 100 * (sum of weights of passed criteria) / (sum of weights of *decidable*
criteria). Criteria with insufficient data (``passed is None``) are excluded
from the denominator but surfaced in the scorecard so gaps are visible.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from ..models import Criterion, Fundamentals, MarketData, ScreenResult


class Screen(ABC):
    key: str = "screen"
    label: str = "Screen"
    #: minimum score (0..100) for the stock to count as "passing" the screen.
    pass_bar: float = 80.0

    def __init__(self, cfg: Dict[str, Any]):
        self.cfg = cfg

    @abstractmethod
    def evaluate(self, f: Fundamentals, m: MarketData
                 ) -> List[Criterion]:
        """Return the criteria for this stock (subclasses implement rules)."""
        ...

    def run(self, f: Fundamentals, m: MarketData) -> ScreenResult:
        criteria = self.evaluate(f, m)
        score = score_criteria(criteria)
        passed = score >= self.pass_bar
        return ScreenResult(screen=self.key, ticker=f.ticker, score=score,
                            passed=passed, criteria=criteria)


def score_criteria(criteria: List[Criterion]) -> float:
    decidable = [c for c in criteria if c.passed is not None]
    if not decidable:
        return 0.0
    total_w = sum(c.weight for c in decidable)
    got_w = sum(c.weight for c in decidable if c.passed)
    return 100.0 * got_w / total_w if total_w else 0.0


# --- small helpers to build criteria safely from possibly-missing values ----

def crit(name: str, value: Any, threshold: Any, test, *, weight: float = 1.0,
         note: str = "") -> Criterion:
    """Build a criterion, marking it undecidable when the value is missing."""
    passed: Optional[bool]
    if value is None:
        passed = None
    else:
        try:
            passed = bool(test(value))
        except Exception:
            passed = None
    return Criterion(name=name, passed=passed, value=value,
                     threshold=threshold, weight=weight, note=note)


def le(t):    # value <= t
    return lambda v: v <= t


def ge(t):    # value >= t
    return lambda v: v >= t


def between(lo, hi):
    return lambda v: lo <= v <= hi
