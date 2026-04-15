"""Document API response shapes.

Two variants: `DocumentFull` for the engine's native shape, and `DocumentFeedItem`
for the Sada-compatible compact shape. Both derive from the same underlying
Document + Analysis rows.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Pagination


class AnalysisOut(BaseModel):
    """The structured analytical scaffolding Claude produces."""

    model_config = ConfigDict(from_attributes=True)

    prompt_variant: str
    thesis: str | None = None
    key_points: list[str] | None = Field(default=None, alias="key_points_json")
    evidence_type: str | None = None
    methodology: str | None = None
    frameworks: list[str] | None = Field(default=None, alias="frameworks_json")
    regions: list[str] | None = Field(default=None, alias="regions_json")
    topics: list[str] | None = Field(default=None, alias="topics_json")
    actors: list[str] | None = Field(default=None, alias="actors_json")
    counterarguments: str | None = None
    limitations: str | None = None
    implications: str | None = None
    ar_summary: str | None = None
    en_summary: str | None = None
    key_quotes: list[dict] | None = Field(default=None, alias="key_quotes_json")
    extras: dict | None = Field(default=None, alias="extras_json")
    model: str
    created_at: datetime


class DocumentSource(BaseModel):
    """Minimal source metadata embedded in every document response."""

    id: int
    slug: str
    name: str
    category: str
    priority: str
    url: str


class DocumentFull(BaseModel):
    """Engine-native document shape with the full analytical structure."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    source: DocumentSource
    canonical_url: str
    document_type: str
    title: str
    title_ar: str | None = None
    authors: list[str] | None = Field(default=None, alias="authors_json")
    abstract: str | None = None
    language: str | None = None
    published_at: datetime | None = None
    fetched_at: datetime
    analysis_status: str
    analysis: AnalysisOut | None = None


class DocumentFeedItem(BaseModel):
    """Compact card shape compatible with Sada's existing Post component.

    The base fields (id, title, brief, body, tags, tag, realImg, s, pubTs,
    brk, flags) intentionally match Sada's feed-item conventions so the
    main-feed Post component can render this shape unchanged.

    The engine also ships a second tier of *analytical* fields that Sada's
    dedicated depth-vertical (DepthPost) consumes to render a richer, more
    detailed block — everything below `category` is optional and only
    populated when the document has been analyzed with the v2 prompt. A
    consumer that doesn't know about these fields simply ignores them and
    renders the standard news-card shape.
    """

    # --- Core feed fields (Sada Post compatible) ---
    id: str
    title: str
    brief: str | None = None
    body: str | None = None
    tags: list[str] = Field(default_factory=list)
    tag: str | None = None
    realImg: str | None = None
    s: dict = Field(default_factory=dict)  # {n, logo, domain}
    pubTs: int | None = None  # unix millis
    brk: bool = False
    flags: list[str] = Field(default_factory=list)

    # --- Engine metadata (cheap, always included) ---
    canonical_url: str | None = None
    language: str | None = None
    priority: str | None = None  # "Tier 1" | "Tier 2" | "Tier 3"
    category: str | None = None
    document_type: str | None = None

    # --- v2 decomposition (the reason DepthPost exists) ---
    # `thesis` is the v1 legacy field; `analytical_conclusion` is the
    # flagship v2 field — the real claim, institutional language stripped.
    thesis: str | None = None
    analytical_conclusion: str | None = None
    core_argument: str | None = None
    supporting_logic: str | None = None
    assumptions: list[str] | None = None
    analytical_frame: str | None = None
    tensions: str | None = None
    if_correct_then: str | None = None

    # --- Scaffolding lists (chips & tag rows in DepthPost) ---
    frameworks: list[str] | None = None
    regions: list[str] | None = None
    actors: list[str] | None = None
    key_quotes: list[dict] | None = None

    # --- Long-form summaries (tabbed view in DepthPost detail) ---
    ar_summary: str | None = None
    en_summary: str | None = None


class DocumentListResponse(BaseModel):
    ok: bool = True
    pagination: Pagination
    shape: str  # "full" or "feed"
    documents: list[Any]  # Either list[DocumentFull] or list[DocumentFeedItem]
