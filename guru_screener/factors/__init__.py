"""Factor engine: codified philosophy screens.

Each screen is a :class:`~guru_screener.factors.base.Screen` that turns a stock's
:class:`Fundamentals` + :class:`MarketData` into a :class:`ScreenResult` — a list
of pass/fail criteria plus a 0..100 score. Screens are pure functions of their
inputs (transparent + testable, spec §8).
"""
from .registry import build_screens, SCREEN_CLASSES  # noqa: F401
