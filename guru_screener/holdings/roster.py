"""Guru roster (spec §6.2).

Each entry either codifies as a philosophy *screen*, contributes a 13F *overlay*,
or both. "Overlay-only" managers (Ackman, Einhorn, Burry) resist clean factor
codification — we include their holdings, not a screen.

CIKs are the SEC filer IDs used to pull 13F-HR filings. They are best-known
values and are *verifiable/overridable*: run ``python -m guru_screener resolve``
to look up or confirm a filer's CIK live via EDGAR, or edit this file. A wrong
CIK simply yields no holdings for that manager (the app degrades gracefully).

Graham and Lynch are historical figures with no current 13F to overlay — they
contribute screens only.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Guru:
    key: str
    name: str
    vehicle: str
    philosophy: str
    #: SEC CIK for 13F overlay (None for historical / screen-only figures).
    cik: Optional[str] = None
    #: does a codified screen represent this investor?
    has_screen: bool = False
    #: is this manager's 13F overlaid onto the screen?
    has_overlay: bool = False
    #: which screen key best reflects this manager's style (for the gap signal).
    screen_affinity: Optional[str] = None
    #: overlay-only managers: holdings shown, no screen (activist/contrarian edge).
    overlay_only: bool = False
    cik_verified: bool = False


# The approved v1 roster. Adjust rows here to cut / add / reclassify.
ROSTER: List[Guru] = [
    Guru("graham", "Benjamin Graham", "—",
         "Deep/defensive value, margin of safety",
         has_screen=True, screen_affinity="graham"),
    Guru("buffett", "Warren Buffett", "Berkshire Hathaway",
         "Quality moats at fair prices", cik="0001067983",
         has_screen=True, has_overlay=True, screen_affinity="buffett",
         cik_verified=True),
    Guru("lynch", "Peter Lynch", "—",
         "GARP, invest in what you know",
         has_screen=True, screen_affinity="lynch"),
    Guru("greenblatt", "Joel Greenblatt", "Gotham Asset Management",
         "Magic Formula (yield + ROIC)", cik="0001510387",
         has_screen=True, has_overlay=True, screen_affinity="greenblatt"),
    Guru("klarman", "Seth Klarman", "Baupost Group",
         "Deep value, margin of safety", cik="0001061768",
         has_overlay=True, screen_affinity="graham"),
    Guru("pabrai", "Mohnish Pabrai", "Dalal Street / Pabrai Funds",
         "Concentrated Graham/Buffett value", cik="0001549575",
         has_overlay=True, screen_affinity="buffett"),
    Guru("akre", "Chuck Akre", "Akre Capital Management",
         "Quality compounders (three-legged stool)", cik="0001112520",
         has_overlay=True, screen_affinity="buffett"),
    Guru("lilu", "Li Lu", "Himalaya Capital Management",
         "Munger-style concentrated value", cik="0001709323",
         has_overlay=True, screen_affinity="buffett"),
    Guru("ackman", "Bill Ackman", "Pershing Square",
         "Concentrated quality + activism", cik="0001336528",
         has_overlay=True, overlay_only=True, screen_affinity="buffett"),
    Guru("einhorn", "David Einhorn", "Greenlight Capital",
         "Value long/short + catalysts (longs only)", cik="0001079114",
         has_overlay=True, overlay_only=True, screen_affinity="graham"),
    Guru("terry_smith", "Terry Smith", "Fundsmith",
         "Quality compounders, never overpay", cik="0001569205",
         has_overlay=True, screen_affinity="buffett"),
    Guru("burry", "Michael Burry", "Scion Asset Management",
         "Contrarian deep value", cik="0001649339",
         has_overlay=True, overlay_only=True, screen_affinity="graham"),
]

ROSTER_BY_KEY = {g.key: g for g in ROSTER}
ROSTER_BY_CIK = {g.cik: g for g in ROSTER if g.cik}


def screen_gurus() -> List[Guru]:
    return [g for g in ROSTER if g.has_screen]


def overlay_gurus() -> List[Guru]:
    """Managers with a live 13F to ingest."""
    return [g for g in ROSTER if g.has_overlay and g.cik]
