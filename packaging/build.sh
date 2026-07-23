#!/usr/bin/env bash
# Build a standalone Guru Stock Screener bundle with PyInstaller.
# Run from the project root:  ./packaging/build.sh
set -euo pipefail

cd "$(dirname "$0")/.."   # project root

echo "==> Installing build + runtime deps"
python -m pip install -r requirements.lock.txt >/dev/null
python -m pip install pyinstaller pywebview >/dev/null

echo "==> Cleaning previous build"
rm -rf build dist

echo "==> Freezing"
pyinstaller --noconfirm --clean packaging/guru_screener.spec

echo
echo "==> Done. Launch it with:"
echo "    ./dist/guru-screener/guru-screener            # desktop app"
echo "    ./dist/guru-screener/guru-screener seed       # offline demo data"
echo "    ./dist/guru-screener/guru-screener refresh    # live data"
echo
echo "User config + cache live in ~/.guru-screener/ (override with GURU_HOME)."
