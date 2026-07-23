"""Guru Stock Screener.

A local, single-user desktop application that screens US-listed equities two
ways at once: codified *philosophy* screens (Graham, Buffett, Lynch, Greenblatt)
and a *13F holdings overlay* of what a curated roster of gurus actually owns.

Layered architecture (each layer swappable):

    data adapters -> factor engine -> scoring -> 13F overlay -> UI
"""

__version__ = "0.1.0"
