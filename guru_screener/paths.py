"""Filesystem locations for config and cache.

In development the app keeps config in the repo (``config/settings.yaml``) and the
cache in ``./.cache`` — convenient and gitignored. But a **frozen** PyInstaller
build runs from a read-only bundle, so config and cache must live in a writable
per-user directory instead.

Resolution rules (both honour the ``GURU_HOME`` env override):

* dev / from source, repo is writable  -> repo paths (unchanged behaviour)
* frozen build, or repo not writable    -> ``~/.guru-screener/``
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Repo root = parent of this package directory (valid when running from source).
ROOT = Path(__file__).resolve().parent.parent


def is_frozen() -> bool:
    """True when running inside a PyInstaller (or similar) frozen bundle."""
    return bool(getattr(sys, "frozen", False))


def user_home() -> Path:
    """Writable per-user data directory for a production install."""
    override = os.environ.get("GURU_HOME")
    base = Path(override) if override else Path.home() / ".guru-screener"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _repo_writable() -> bool:
    try:
        return os.access(ROOT, os.W_OK) and (ROOT / "config").exists()
    except OSError:
        return False


def use_user_home() -> bool:
    """Whether to store config/cache under the per-user home dir."""
    if os.environ.get("GURU_HOME"):
        return True
    return is_frozen() or not _repo_writable()


def bundled_config_template() -> Path:
    """Path to the default settings.yaml shipped with the app.

    When frozen, PyInstaller unpacks data files under ``sys._MEIPASS``.
    """
    if is_frozen():
        base = Path(getattr(sys, "_MEIPASS", ROOT))
        return base / "config" / "settings.yaml"
    return ROOT / "config" / "settings.yaml"
