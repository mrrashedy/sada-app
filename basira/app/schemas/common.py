"""Common API response primitives."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class FeedShape(str, Enum):
    """Dual response shapes.

    - `full`: the engine's native shape with the full Analysis object.
    - `feed`: a compact card shape compatible with Sada's existing Post component.
    """

    FULL = "full"
    FEED = "feed"


class Pagination(BaseModel):
    limit: int = Field(default=30, ge=1, le=200)
    offset: int = Field(default=0, ge=0)
    total: int = 0
