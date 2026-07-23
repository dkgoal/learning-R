"""CSV export of scorecard rows (spec §6.4, §8 reproducibility)."""
from __future__ import annotations

import csv
import io
from typing import Any, Dict, List

# Columns exported, in order. List-valued fields are joined for CSV.
COLUMNS = [
    "ticker", "name", "sector", "is_adr", "market_cap", "price",
    "pe", "pb", "peg", "fcf_yield", "earnings_yield",
    "graham_score", "buffett_score", "lynch_score", "greenblatt_score",
    "greenblatt_rank", "composite", "n_passes", "passes",
    "n_gurus", "guru_holders", "new_buy_by",
]


def scorecards_to_csv(rows: List[Dict[str, Any]]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(COLUMNS)
    for r in rows:
        out = []
        for col in COLUMNS:
            v = r.get(col)
            if isinstance(v, list):
                v = "; ".join(str(x) for x in v)
            out.append("" if v is None else v)
        writer.writerow(out)
    return buf.getvalue()
