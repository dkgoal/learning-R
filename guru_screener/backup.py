"""Back up / restore the local cache (spec §8: the cache is the whole app state).

The SQLite store + parquet price cache under ``data.cache_dir`` are gitignored
and hold everything the app knows. A single zip lets you snapshot before a
refresh and recover from a provider outage without re-fetching from scratch.
"""
from __future__ import annotations

import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from .config import cache_dir


def backup_cache(cfg: Dict[str, Any], out: Optional[Path | str] = None) -> Path:
    """Zip the cache directory. Returns the archive path."""
    src = cache_dir(cfg)
    if out is None:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        out = src.parent / f"guru-cache-backup-{stamp}.zip"
    out = Path(out)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(src.rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(src))
    return out


def restore_cache(cfg: Dict[str, Any], archive: Path | str) -> Path:
    """Extract a backup archive back into the cache directory."""
    dst = cache_dir(cfg)
    with zipfile.ZipFile(archive, "r") as zf:
        zf.extractall(dst)
    return dst
