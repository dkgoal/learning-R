"""Shared pytest fixtures: an isolated demo-seeded cache per test session."""
import os
import tempfile
from pathlib import Path

import pytest

from guru_screener.config import load_config


@pytest.fixture(scope="session")
def cfg(tmp_path_factory):
    """A config pointed at a throwaway cache dir, demo-seeded once."""
    base = load_config()
    cache = tmp_path_factory.mktemp("cache")
    base["data"]["cache_dir"] = str(cache)
    from guru_screener.demo.seed import seed
    store = seed(base)
    store.close()
    return base


@pytest.fixture()
def store(cfg):
    from guru_screener.config import cache_dir
    from guru_screener.db import open_store
    s = open_store(cache_dir(cfg))
    yield s
    s.close()


@pytest.fixture()
def price_service(cfg):
    from guru_screener.adapters.http import HttpClient
    from guru_screener.adapters.prices import PriceService
    from guru_screener.config import cache_dir
    return PriceService(HttpClient("test"), cache_dir(cfg))
