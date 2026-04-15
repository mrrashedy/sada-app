"""Analysis model — the structured output Claude produces for each document.

Schema is shared across all six prompt variants; category-specific fields live
in `extras_json`. This keeps the API uniform while preserving variant-specific
detail.
"""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.document import Document


class Analysis(Base):
    __tablename__ = "analyses"

    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )

    # Which prompt we used. One of:
    #   research_paper | official_statement | multilateral_report
    #   long_form_media | dataset_release | conference_output
    prompt_variant: Mapped[str] = mapped_column(String(40), index=True)

    # The flagship output — a compressed, institutional-language-stripped
    # statement of the real claim. See EDITORIAL_CONSTITUTION in prompts.py.
    analytical_conclusion: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Decomposition fields — the components the "analytical_conclusion" is
    # built on. Kept as separate columns (not nested JSON) so they can be
    # queried, filtered on, and displayed individually in the reader UI.
    core_argument: Mapped[str | None] = mapped_column(Text, nullable=True)
    supporting_logic: Mapped[str | None] = mapped_column(Text, nullable=True)
    assumptions_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    analytical_frame: Mapped[str | None] = mapped_column(Text, nullable=True)
    tensions: Mapped[str | None] = mapped_column(Text, nullable=True)
    if_correct_then: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Legacy / compat — kept so existing dashboard views continue to work.
    # `thesis` maps to `core_argument` for backward-compatibility. Do not
    # populate both from new analyses; populate `core_argument` only.
    thesis: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_points_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    evidence_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    methodology: Mapped[str | None] = mapped_column(Text, nullable=True)

    frameworks_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    regions_json: Mapped[list | None] = mapped_column(JSON, nullable=True, index=False)
    topics_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    actors_json: Mapped[list | None] = mapped_column(JSON, nullable=True)

    counterarguments: Mapped[str | None] = mapped_column(Text, nullable=True)
    limitations: Mapped[str | None] = mapped_column(Text, nullable=True)
    implications: Mapped[str | None] = mapped_column(Text, nullable=True)

    ar_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    en_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    key_quotes_json: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Category-specific optional fields:
    # - official_statement → policy_signal, audiences
    # - dataset_release → release_version, covered_period, methodology_changes
    # - conference_output → participants, points_of_disagreement
    extras_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Traceability
    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column(String(20), default="v1")
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    document: Mapped["Document"] = relationship(back_populates="analysis")

    def __repr__(self) -> str:
        return f"<Analysis doc={self.document_id} variant={self.prompt_variant}>"
