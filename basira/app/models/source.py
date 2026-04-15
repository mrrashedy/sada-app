"""Source model.

Represents one monitored entity (a think tank, ministry, multilateral, etc.).
Imported from the master CSV at startup and enriched by sources_overrides.yaml.
"""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.document import Document
    from app.models.ingest_run import IngestRun


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True)

    # ---- Fields mirrored from the master CSV ----
    name: Mapped[str] = mapped_column(String(500))
    category: Mapped[str] = mapped_column(String(50), index=True)
    # Free-text region label as written in the CSV (e.g., "USA", "Gulf", "Arab Region").
    region: Mapped[str] = mapped_column(String(200))
    # Language label(s), e.g., "English", "Arabic/English", "Chinese/English".
    language: Mapped[str] = mapped_column(String(200))
    # "Tier 1" / "Tier 2" / "Tier 3"
    priority: Mapped[str] = mapped_column(String(20), index=True)
    url: Mapped[str] = mapped_column(String(1000))

    # ---- Fields layered in from sources_overrides.yaml ----
    # One of: rss_first | html_list | universal_fallback | pdf_only | custom
    scrape_strategy: Mapped[str] = mapped_column(String(50), default="universal_fallback")
    # List of {type: rss|html|atom, url: ...}
    feeds_json: Mapped[list | None] = mapped_column(JSON, nullable=True, default=None)
    list_selector: Mapped[str | None] = mapped_column(String(500), nullable=True)
    link_selector: Mapped[str | None] = mapped_column(String(500), nullable=True)
    custom_scraper: Mapped[str | None] = mapped_column(String(200), nullable=True)
    polling_cadence: Mapped[str | None] = mapped_column(String(50), nullable=True)
    min_poll_interval_seconds: Mapped[int] = mapped_column(Integer, default=900)

    # ---- Runtime / operational ----
    last_polled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # ---- Relationships ----
    documents: Mapped[list["Document"]] = relationship(back_populates="source")
    ingest_runs: Mapped[list["IngestRun"]] = relationship(back_populates="source")

    def __repr__(self) -> str:
        return f"<Source {self.slug} ({self.category}, {self.priority})>"
