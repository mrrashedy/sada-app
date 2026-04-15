"""Source API response shapes."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import Pagination


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    category: str
    region: str
    language: str
    priority: str
    url: str
    scrape_strategy: str
    active: bool
    last_polled_at: datetime | None = None
    last_seen_at: datetime | None = None


class SourcesResponse(BaseModel):
    ok: bool = True
    pagination: Pagination
    sources: list[SourceOut]
