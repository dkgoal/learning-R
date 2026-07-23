"""CUSIP -> ticker resolver tests."""
from guru_screener.cusip import CusipResolver, load_overrides, normalize_name


def test_normalize_strips_entity_and_class_tokens():
    assert normalize_name("APPLE INC") == "APPLE"
    assert normalize_name("Alphabet Inc. Class A") == "ALPHABET"
    assert normalize_name("Coca-Cola Co (The)") == "COCA COLA"
    assert normalize_name("JOHNSON & JOHNSON") == "JOHNSON AND JOHNSON"
    assert normalize_name("META PLATFORMS INC-CLASS A") == "META PLATFORMS"


def test_resolver_override_beats_name_match(store):
    r = CusipResolver(store, {"037833100": "OVERRIDE"})
    # override wins even though the issuer name would match a real ticker
    assert r.resolve("037833100", "APPLE INC") == "OVERRIDE"


def test_resolver_name_match_and_cache(store):
    r = CusipResolver(store, {})
    # demo universe has "Apple Inc." -> AAPL
    assert r.resolve("111111111", "APPLE INC") == "AAPL"
    # second lookup served from cache; and persisted to the store
    assert r.resolve("111111111", "anything") == "AAPL"
    assert store.cusip_map().get("111111111") == "AAPL"


def test_resolver_unresolved_returns_none(store):
    r = CusipResolver(store, {})
    assert r.resolve("222222222", "TOTALLY UNKNOWN HOLDINGS LP") is None


def test_load_overrides_skips_comments(tmp_path):
    p = tmp_path / "ov.csv"
    p.write_text("# a comment\ncusip,ticker\n037833100,AAPL\n\n# trailing\n")
    assert load_overrides(p) == {"037833100": "AAPL"}
