"""Document model — the generic unit of ingested content.

A Document is any long-form analytical artifact: a think-tank paper, a policy
brief, a government statement, a multilateral working paper, a conference
proceeding, a dataset release, a long-form article, etc. The specific kind is
recorded in `document_type`.
"""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.analysis import Analysis
    from app.models.source import Source
    from app.models.topic import Topic


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id"), index=True)

    canonical_url: Mapped[str] = mapped_column(String(2000), index=True)
    # Content hash of (url + normalized title + first N chars of body). Used for
    # cross-source deduplication.
    dedupe_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    document_type: Mapped[str] = mapped_column(
        String(40), index=True, default="paper"
    )  # paper | policy_brief | report | statement | speech | working_paper |
    # dataset_release | conference_proceedings | long_form_article |
    # press_release | communique | data_note

    title: Mapped[str] = mapped_column(String(1000))
    title_ar: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    authors_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    abstract: Mapped[str | None] = mapped_column(Text, nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str | None] = mapped_column(String(20), nullable=True)

    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    pdf_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    html_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # pending | analyzing | done | failed | skipped
    analysis_status: Mapped[str] = mapped_column(
        String(20), default="pending", index=True
    )

    # Anything we pulled from the source that doesn't fit a column.
    raw_metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # ---- Relationships ----
    source: Mapped["Source"] = relationship(back_populates="documents")
    analysis: Mapped["Analysis | None"] = relationship(
        back_populates="document", uselist=False, cascade="all, delete-orphan"
    )
    topics: Mapped[list["DocumentTopic"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_documents_status_published", "analysis_status", "published_at"),
    )

    def __repr__(self) -> str:
        return f"<Document {self.id} {self.title[:60]!r}>"


class DocumentTopic(Base):
    """Join table between documents and topics, with a confidence score."""

    __tablename__ = "document_topics"

    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    topic_id: Mapped[int] = mapped_column(
        ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True
    )
    confidence: Mapped[float] = mapped_column(default=1.0)

    document: Mapped["Document"] = relationship(back_populates="topics")
    topic: Mapped["Topic"] = relationship(back_populates="document_topics")
