"""/api/admin — operational endpoints.

Auth: requires the BASIRA_ADMIN_TOKEN to be passed as either a Bearer token
or in the `x-basira-admin-token` header. In v1 this is a simple shared secret;
a Supabase-JWT variant is planned for when Sada is integrated.
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.ingest.loader import load_sources
from app.ingest.pipeline import ingest_source
from app.models.document import Document
from app.models.ingest_run import IngestRun
from app.models.source import Source

router = APIRouter()


def require_admin(
    authorization: Annotated[str | None, Header()] = None,
    x_basira_admin_token: Annotated[str | None, Header()] = None,
) -> None:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(None, 1)[1].strip()
    elif x_basira_admin_token:
        token = x_basira_admin_token.strip()

    expected = settings.admin_token or ""
    if not expected or expected == "changeme":
        raise HTTPException(
            status_code=503,
            detail="admin token not configured — set BASIRA_ADMIN_TOKEN in .env",
        )
    if token != expected:
        raise HTTPException(status_code=401, detail="unauthorized")


@router.post("/reload-sources", dependencies=[Depends(require_admin)])
def reload_sources(db: Session = Depends(get_db)) -> dict:
    result = load_sources(db)
    db.commit()
    return {
        "ok": True,
        "total": result.total_rows,
        "inserted": result.inserted,
        "updated": result.updated,
        "deactivated": result.deactivated,
    }


@router.get("/health", dependencies=[Depends(require_admin)])
def admin_health(db: Session = Depends(get_db)) -> dict:
    """Per-source ingestion health snapshot.

    Returns counts by status plus the last ingest run per source, so the reader's
    /health dashboard can show green/yellow/red indicators across all 309+ sources.
    """
    total_sources = db.query(Source).filter(Source.active.is_(True)).count()

    # Count recent run statuses
    status_rows = (
        db.query(IngestRun.status, func.count())
        .group_by(IngestRun.status)
        .all()
    )
    status_counts = {s: c for s, c in status_rows}

    # Sources that have never been polled
    never_polled = db.query(Source).filter(
        Source.active.is_(True), Source.last_polled_at.is_(None)
    ).count()

    # Most recent error runs (for debugging)
    recent_errors = (
        db.query(IngestRun)
        .filter(IngestRun.status == "error")
        .order_by(desc(IngestRun.started_at))
        .limit(20)
        .all()
    )

    return {
        "ok": True,
        "total_active_sources": total_sources,
        "never_polled": never_polled,
        "run_status_counts": status_counts,
        "recent_errors": [
            {
                "source_id": r.source_id,
                "started_at": r.started_at.isoformat(),
                "error": (r.error or "")[:200],
            }
            for r in recent_errors
        ],
    }


@router.post("/refresh/{source_slug}", dependencies=[Depends(require_admin)])
def force_refresh(
    source_slug: str,
    max_new: int = 15,
    db: Session = Depends(get_db),
) -> dict:
    """Force-poll a source now. Runs inline — returns after ingestion completes."""
    src = db.query(Source).filter_by(slug=source_slug).one_or_none()
    if not src:
        raise HTTPException(404, detail=f"source not found: {source_slug}")
    return ingest_source(db, src.id, max_new=max_new)


@router.post("/analyze/{document_id}", dependencies=[Depends(require_admin)])
def force_analyze(
    document_id: int,
    force: bool = True,
    db: Session = Depends(get_db),
) -> dict:
    """Run Claude analysis on a specific document right now.

    Requires ANTHROPIC_API_KEY and VOYAGE_API_KEY in .env. If not set,
    returns a clear error.
    """
    from app.analyze.pipeline import analyze_document

    doc = db.query(Document).filter_by(id=document_id).one_or_none()
    if not doc:
        raise HTTPException(404, detail=f"document not found: {document_id}")

    if not settings.anthropic_api_key or settings.anthropic_api_key.startswith("sk-ant-..."):
        raise HTTPException(503, detail="ANTHROPIC_API_KEY not configured in .env")

    try:
        analysis = analyze_document(db, document_id, force=force)
    except Exception as e:
        raise HTTPException(500, detail=f"analysis failed: {e}") from e

    if analysis is None:
        return {
            "ok": True,
            "document_id": document_id,
            "note": "skipped (tier not in BASIRA_ANALYZE_TIERS)",
        }

    return {
        "ok": True,
        "document_id": document_id,
        "variant": analysis.prompt_variant,
        "model": analysis.model,
        "input_tokens": analysis.input_tokens,
        "output_tokens": analysis.output_tokens,
    }
