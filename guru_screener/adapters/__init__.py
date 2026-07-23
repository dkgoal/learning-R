"""Swappable data-source adapters.

Every external source sits behind an interface (:mod:`.base`) so a flaky free
provider can be replaced without touching screening logic (spec §5 design
implication). Concrete adapters:

* :mod:`.sec_edgar` — fundamentals (companyfacts/XBRL) + 13F holdings.
* :mod:`.prices`    — EOD prices with a provider fallback chain.
"""
