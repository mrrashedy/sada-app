"""Topic taxonomy — the conceptual spine used for categorization and navigation."""
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.document import DocumentTopic


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    name_en: Mapped[str] = mapped_column(String(200))
    name_ar: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("topics.id"), nullable=True
    )

    parent: Mapped["Topic | None"] = relationship(
        "Topic", remote_side=[id], backref="children"
    )
    document_topics: Mapped[list["DocumentTopic"]] = relationship(back_populates="topic")

    def __repr__(self) -> str:
        return f"<Topic {self.slug}>"
