"""Configuration loading/saving.

Settings live in ``config/settings.yaml`` (see that file for documented
defaults). The Settings UI can persist edits back through :func:`save_config`.
Thresholds are intentionally data, not code, so screens stay tunable (spec §6.1).
"""
from __future__ import annotations

import copy
import os
from pathlib import Path
from typing import Any, Dict

import yaml

# Project root = parent of the package directory.
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = ROOT / "config" / "settings.yaml"


def config_path() -> Path:
    """Resolve the active config path (env override for tests/alt profiles)."""
    return Path(os.environ.get("GURU_CONFIG", DEFAULT_CONFIG_PATH))


def load_config(path: Path | str | None = None) -> Dict[str, Any]:
    """Load settings YAML into a plain dict."""
    p = Path(path) if path else config_path()
    with open(p, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def save_config(cfg: Dict[str, Any], path: Path | str | None = None) -> None:
    """Persist settings back to YAML (used by the Settings UI)."""
    p = Path(path) if path else config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as fh:
        yaml.safe_dump(cfg, fh, sort_keys=False, default_flow_style=False)


def cache_dir(cfg: Dict[str, Any]) -> Path:
    """Absolute path to the local cache directory, created on demand."""
    raw = cfg.get("data", {}).get("cache_dir", ".cache")
    p = Path(raw)
    if not p.is_absolute():
        p = ROOT / p
    p.mkdir(parents=True, exist_ok=True)
    return p


def deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge ``override`` into a copy of ``base`` (for UI patches)."""
    out = copy.deepcopy(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out
