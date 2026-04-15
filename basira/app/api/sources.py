"""/api/sources — list and inspect monitored sources."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.source import Source
from app.schemas.common import Pagination
from app.schemas.source import SourceOut, SourcesResponse

router = APIRouter()


@router.get("", response_model=SourcesResponse)
def list_sources(
    category: str | None = Query(None, description="Filter by category"),
    priority: str | None = Query(None, description='"Tier 1" | "Tier 2" | "Tier 3"'),
    region: str | None = Query(None, description="Substring match on region"),
    language: str | None = Query(None, description="Substring match on language"),
    active: bool | None = Query(True),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> SourcesResponse:
    q = db.query(Source)
    if category:
        q = q.filter(Source.category == category)
    if priority:
        q = q.filter(Source.priority == priority)
    if region:
        q = q.filter(Source.region.ilike(f"%{region}%"))
    if language:
        q = q.filter(Source.language.ilike(f"%{language}%"))
    if active is not None:
        q = q.filter(Source.active.is_(active))

    total = q.count()
    rows = (
        q.order_by(Source.priority.asc(), Source.name.asc()).offset(offset).limit(limit).all()
    )
    return SourcesResponse(
        pagination=Pagination(limit=limit, offset=offset, total=total),
        sources=[SourceOut.model_validate(s) for s in rows],
    )


@router.get("/stats")
def stats(db: Session = Depends(get_db)) -> dict:
    """Aggregate counts by category and tier. Useful for the admin dashboard."""
    by_category = dict(
        db.query(Source.category, func.count())
        .filter(Source.active.is_(True))
        .group_by(Source.category)
        .all()
    )
    by_priority = dict(
        db.query(Source.priority, func.count())
        .filter(Source.active.is_(True))
        .group_by(Source.priority)
        .all()
    )
    total = db.query(Source).filter(Source.active.is_(True)).count()
    return {
        "ok": True,
        "total": total,
        "by_category": by_category,
        "by_priority": by_priority,
    }


@router.get("/{slug}", response_model=SourceOut)
def get_source(slug: str, db: Session = Depends(get_db)) -> SourceOut:
    src = db.query(Source).filter_by(slug=slug).one_or_none()
    if not src:
        raise HTTPException(status_code=404, detail=f"source not found: {slug}")
    return SourceOut.model_validate(src)
