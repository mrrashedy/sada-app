"""IngestRun — one row per polling attempt per source.

Used by the /admin/health dashboard to tell which sources are healthy and which
are broken across 309+ monitored sources.
"""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.source import Source


class IngestRun(Base):
    __tablename__ = "ingest_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[int] = mapped_column(
        ForeignKey("sources.id", ondelete="CASCADE"), index=True
    )

    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # "running" | "success" | "empty" | "error"
    status: Mapped[str] = mapped_column(String(20), default="running", index=True)

    strategy: Mapped[str | None] = mapped_column(String(50), nullable=True)
    documents_found: Mapped[int] = mapped_column(Integer, default=0)
    documents_new: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    source: Mapped["Source"] = relationship(back_populates="ingest_runs")

    def __repr__(self) -> str:
        return f"<IngestRun source={self.source_id} status={self.status}>"
