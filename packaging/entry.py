"""Frozen-app entry point.

PyInstaller freezes a script rather than a ``python -m`` module, so this thin
wrapper imports the package and hands off to the normal CLI. With no arguments
it launches the desktop app (pywebview window, or browser fallback).
"""
import os
import sys

# When run from source (not frozen), ensure the project root is importable.
if not getattr(sys, "frozen", False):
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from guru_screener.__main__ import main

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
