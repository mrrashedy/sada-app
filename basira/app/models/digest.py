"""Digest model — weekly curated summaries generated from the corpus."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Digest(Base):
    __tablename__ = "digests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period: Mapped[str] = mapped_column(String(20), index=True)  # e.g., "2026-W16"
    region: Mapped[str] = mapped_column(String(40), index=True)
    category_filter: Mapped[str | None] = mapped_column(String(200), nullable=True)

    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    content_md: Mapped[str] = mapped_column(Text)
    source_document_ids_json: Mapped[list] = mapped_column(JSON)

    def __repr__(self) -> str:
        return f"<Digest {self.period} {self.region}>"
