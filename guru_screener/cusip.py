"""CUSIP -> ticker resolution for 13F holdings.

13F information tables identify positions by 9-char CUSIP; there is no clean,
free, authoritative CUSIP->ticker file. This is the single biggest data-quality
limitation of the overlay. We resolve best-effort, in priority order:

1. **User overrides** — ``config/cusip_overrides.csv`` (``cusip,ticker``). The
   escape hatch: authoritative for the positions you care about most.
2. **Cached map** — anything previously resolved, persisted in the ``cusip_map``
   table so it's stable across refreshes.
3. **Issuer-name match** — normalize the 13F issuer name and match it against the
   universe (from SEC ``company_tickers.json``). Confident exact-normalized
   matches are cached with source ``name-match``.

Anything unresolved stays ``ticker=None`` and shows by issuer name (no ownership
badge on the screener). Fill the gaps that matter via the overrides file.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Dict, Optional

from .db import Store

# Entity-type + share-class tokens dropped when normalizing an issuer name.
_STOPWORDS = {
    "INC", "INCORPORATED", "CORP", "CORPORATION", "CO", "COMPANY", "COS",
    "LTD", "LIMITED", "PLC", "LLC", "LP", "LLP", "SA", "NV", "AG", "SE",
    "THE", "CLASS", "CL", "COM", "COMMON", "STOCK", "SHARES", "SHS", "SHARE",
    "ADR", "ADS", "SPON", "SPONSORED", "REIT", "TR", "TRUST", "NEW", "HLDG",
    "HLDGS",
}


def normalize_name(name: str) -> str:
    """Reduce an issuer/company name to a comparable key."""
    s = (name or "").upper()
    s = re.sub(r"\([^)]*\)", " ", s)        # drop parenthetical notes
    s = s.replace("&", " AND ")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)       # strip punctuation
    tokens = [t for t in s.split() if t and t not in _STOPWORDS]
    # drop trailing single-letter share-class markers (…"A", …"B")
    while len(tokens) > 1 and len(tokens[-1]) == 1:
        tokens.pop()
    return " ".join(tokens)


class CusipResolver:
    """Resolve CUSIP -> ticker, caching confident matches back to the store."""

    def __init__(self, store: Store, overrides: Optional[Dict[str, str]] = None):
        self.store = store
        self.overrides = {k.upper(): v.upper() for k, v in (overrides or {}).items()}
        self.cache: Dict[str, str] = dict(store.cusip_map())
        # Build a normalized-name -> ticker index from the cached universe.
        self.name_index: Dict[str, str] = {}
        for sec in store.securities():
            key = normalize_name(sec["name"])
            if not key:
                continue
            existing = self.name_index.get(key)
            # On collision (share classes), prefer the shorter ticker.
            if existing is None or len(sec["ticker"]) < len(existing):
                self.name_index[key] = sec["ticker"].upper()

    def resolve(self, cusip: str, issuer: str) -> Optional[str]:
        cusip = (cusip or "").upper()
        if cusip in self.overrides:
            t = self.overrides[cusip]
            self._remember(cusip, t, issuer, "override")
            return t
        if cusip in self.cache:
            return self.cache[cusip]
        t = self.name_index.get(normalize_name(issuer))
        if t:
            self._remember(cusip, t, issuer, "name-match")
            return t
        return None

    def _remember(self, cusip: str, ticker: str, issuer: str, source: str) -> None:
        self.cache[cusip] = ticker
        self.store.put_cusip(cusip, ticker, issuer, source)


def load_overrides(path: Path | str) -> Dict[str, str]:
    """Load a ``cusip,ticker`` CSV of manual overrides (missing file -> empty)."""
    p = Path(path)
    if not p.exists():
        return {}
    out: Dict[str, str] = {}
    with open(p, newline="", encoding="utf-8") as fh:
        # Drop blank and #-comment lines so the real header row is first.
        lines = [ln for ln in fh
                 if ln.strip() and not ln.lstrip().startswith("#")]
    for row in csv.DictReader(lines):
        cusip = (row.get("cusip") or "").strip()
        ticker = (row.get("ticker") or "").strip()
        if cusip and ticker:
            out[cusip.upper()] = ticker.upper()
    return out
