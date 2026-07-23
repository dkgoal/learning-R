# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec — freeze the Guru Stock Screener into a standalone app.

Run from the project root:

    pip install pyinstaller pywebview        # pywebview optional but recommended
    pyinstaller packaging/guru_screener.spec

Output: dist/guru-screener (onedir) with the launcher executable inside.

Data files (Flask templates/static + the default config template) are bundled to
the same package-relative paths they occupy in source, so Flask's template
loader and ``paths.bundled_config_template`` find them under ``sys._MEIPASS``.
User config + cache live in ``~/.guru-screener/`` at runtime (see paths.py), so
the frozen bundle stays read-only.
"""
import os

# When PyInstaller executes a spec, __file__ is unavailable; use the CWD
# (the project root, per the run instruction above).
ROOT = os.path.abspath(os.getcwd())

datas = [
    (os.path.join(ROOT, "guru_screener", "web", "templates"),
     os.path.join("guru_screener", "web", "templates")),
    (os.path.join(ROOT, "guru_screener", "web", "static"),
     os.path.join("guru_screener", "web", "static")),
    (os.path.join(ROOT, "config", "settings.yaml"), "config"),
    (os.path.join(ROOT, "config", "cusip_overrides.csv"), "config"),
]

hiddenimports = [
    "guru_screener",
    "pandas",
    "pyarrow",
]

a = Analysis(
    [os.path.join(ROOT, "packaging", "entry.py")],
    pathex=[ROOT],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="guru-screener",
    console=True,          # keep a console so CLI subcommands work too
    disable_windowed_traceback=False,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    name="guru-screener",
)
