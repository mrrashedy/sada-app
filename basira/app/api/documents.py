"""/api/documents — list, detail, related.

Supports dual response shapes via `?shape=full` (default) or `?shape=feed`
(Sada-compatible compact shape).
"""
from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models.document import Document
from app.models.source import Source
from app.schemas.common import FeedShape, Pagination
from app.schemas.document import (
    AnalysisOut,
    DocumentFeedItem,
    DocumentFull,
    DocumentListResponse,
    DocumentSource,
)

router = APIRouter()


def _truncate_sentence(text: str, max_chars: int = 180) -> str:
    """Truncate at a sentence boundary for the `brief` field."""
    if not text:
        return ""
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    for sep in (". ", "؟ ", "! ", "؛ ", "، ", " "):
        i = cut.rfind(sep)
        if i > max_chars * 0.5:
            return cut[: i + 1].rstrip() + "…"
    return cut.rstrip() + "…"


def _domain(url: str) -> str:
    try:
        return urlparse(url).netloc.replace("www.", "")
    except Exception:
        return ""


def _to_full(doc: Document) -> DocumentFull:
    return DocumentFull(
        id=doc.id,
        source=DocumentSource(
            id=doc.source.id,
            slug=doc.source.slug,
            name=doc.source.name,
            category=doc.source.category,
            priority=doc.source.priority,
            url=doc.source.url,
        ),
        canonical_url=doc.canonical_url,
        document_type=doc.document_type,
        title=doc.title,
        title_ar=doc.title_ar,
        authors_json=doc.authors_json,
        abstract=doc.abstract,
        language=doc.language,
        published_at=doc.published_at,
        fetched_at=doc.fetched_at,
        analysis_status=doc.analysis_status,
        analysis=(
            AnalysisOut.model_validate(doc.analysis) if doc.analysis else None
        ),
    )


def _to_feed(doc: Document) -> DocumentFeedItem:
    """Map to Sada's feed-item shape, enriched with v2 decomposition fields.

    The feed shape has two layers:

    1. The core Sada-compatible card fields (id, title, brief, body, s, tags,
       pubTs, ...) — lets the existing news Post component render the item
       with zero new code.
    2. A second layer of v2 analytical fields (analytical_conclusion,
       core_argument, supporting_logic, assumptions, analytical_frame,
       tensions, if_correct_then, frameworks, regions, actors, key_quotes)
       that Sada's depth-vertical consumes to render a *detailed* block.

    A consumer that doesn't know about the second layer simply ignores it.
    """
    # Prefer the full-fetched body over the RSS abstract — re-polled docs
    # have abstracts capped at 500 chars (RSS summary length) but bodies
    # that run 5k–30k chars. The depth UI wants the real content, not the
    # teaser. Fall back to abstract only when body is missing or shorter.
    def _longest_raw() -> str:
        candidates = [doc.body or "", doc.abstract or ""]
        return max(candidates, key=len).strip()

    brief_source = (
        doc.analysis.en_summary if (doc.analysis and doc.analysis.en_summary)
        else _longest_raw()
    )
    # Short teaser line. ~300 chars is roughly 2 sentences — enough to
    # convey what the doc is about without dominating the block.
    brief = _truncate_sentence(brief_source, 300)

    # `body` carries the full article text for the detail view and for
    # DepthPost's "no analysis yet" fallback. 900 chars ≈ one short
    # paragraph — substantial but not overwhelming. We prefer the raw
    # body over the abstract because re-polled docs have full-fetched
    # bodies (5k–30k chars); the abstract is capped at 500 by RSS.
    if doc.analysis and doc.analysis.en_summary:
        body = doc.analysis.en_summary
    else:
        raw = _longest_raw()
        body = raw[:900] if raw else None

    tags: list[str] = []
    tag: str | None = None
    if doc.analysis and doc.analysis.topics_json:
        tags = list(doc.analysis.topics_json)
        tag = tags[0] if tags else None

    a = doc.analysis  # convenience alias; None when analysis is still pending

    return DocumentFeedItem(
        # --- Core card fields ---
        id=str(doc.id),
        title=doc.title,
        brief=brief,
        body=body,
        tags=tags,
        tag=tag,
        realImg=None,
        s={
            "n": doc.source.name,
            "logo": None,
            "domain": _domain(doc.source.url),
        },
        pubTs=(int(doc.published_at.timestamp() * 1000) if doc.published_at else None),
        brk=False,
        flags=[],
        # --- Engine metadata ---
        canonical_url=doc.canonical_url,
        language=doc.language,
        priority=doc.source.priority,
        category=doc.source.category,
        document_type=doc.document_type,
        # --- v2 decomposition (only populated when analysis is done) ---
        thesis=(a.thesis if a else None),
        analytical_conclusion=(a.analytical_conclusion if a else None),
        core_argument=(a.core_argument if a else None),
        supporting_logic=(a.supporting_logic if a else None),
        assumptions=(a.assumptions_json if a else None),
        analytical_frame=(a.analytical_frame if a else None),
        tensions=(a.tensions if a else None),
        if_correct_then=(a.if_correct_then if a else None),
        # --- Scaffolding lists ---
        frameworks=(a.frameworks_json if a else None),
        regions=(a.regions_json if a else None),
        actors=(a.actors_json if a else None),
        key_quotes=(a.key_quotes_json if a else None),
        # --- Long-form summaries ---
        ar_summary=(a.ar_summary if a else None),
        en_summary=(a.en_summary if a else None),
    )


@router.get("", response_model=DocumentListResponse)
def list_documents(
    source: str | None = Query(None, description="Source slug"),
    category: str | None = Query(None, description="Source category"),
    priority: str | None = Query(None, description='"Tier 1" | "Tier 2" | "Tier 3"'),
    document_type: str | None = Query(None),
    status: str | None = Query("done", description="analysis_status filter"),
    shape: FeedShape = Query(FeedShape.FULL),
    limit: int = Query(30, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> DocumentListResponse:
    q = db.query(Document).options(
        joinedload(Document.source), joinedload(Document.analysis)
    )

    if status:
        q = q.filter(Document.analysis_status == status)
    if document_type:
        q = q.filter(Document.document_type == document_type)

    if source or category or priority:
        q = q.join(Source, Document.source_id == Source.id)
        if source:
            q = q.filter(Source.slug == source)
        if category:
            q = q.filter(Source.category == category)
        if priority:
            q = q.filter(Source.priority == priority)

    total = q.count()
    rows = (
        q.order_by(desc(Document.published_at), desc(Document.fetched_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    if shape == FeedShape.FEED:
        items = [_to_feed(d).model_dump() for d in rows]
    else:
        items = [_to_full(d).model_dump(mode="json") for d in rows]

    return DocumentListResponse(
        pagination=Pagination(limit=limit, offset=offset, total=total),
        shape=shape.value,
        documents=items,
    )


@router.get("/{doc_id}", response_model=DocumentFull)
def get_document(doc_id: int, db: Session = Depends(get_db)) -> DocumentFull:
    doc = (
        db.query(Document)
        .options(joinedload(Document.source), joinedload(Document.analysis))
        .filter_by(id=doc_id)
        .one_or_none()
    )
    if not doc:
        raise HTTPException(status_code=404, detail=f"document not found: {doc_id}")
    return _to_full(doc)
