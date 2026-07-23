"""Screen registry: build the enabled screens from config."""
from __future__ import annotations

from typing import Any, Dict, List

from .base import Screen
from .buffett import BuffettScreen
from .graham import GrahamScreen
from .greenblatt import GreenblattScreen
from .lynch import LynchScreen

SCREEN_CLASSES = {
    "graham": GrahamScreen,
    "buffett": BuffettScreen,
    "lynch": LynchScreen,
    "greenblatt": GreenblattScreen,
}


def build_screens(cfg: Dict[str, Any]) -> List[Screen]:
    """Instantiate each enabled screen with its threshold block."""
    screens_cfg = cfg.get("screens", {})
    out: List[Screen] = []
    for key, cls in SCREEN_CLASSES.items():
        block = screens_cfg.get(key, {})
        if block.get("enabled", True):
            out.append(cls(block))
    return out
