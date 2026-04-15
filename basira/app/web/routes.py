"""Reader UI — server-rendered HTML routes.

Uses Jinja2 templates. No build step, no frontend framework. Tailwind is
loaded via CDN in the base template.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import desc, func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db import get_db
from app.models.document import Document
from app.models.source import Source

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

router = APIRouter()


def _key_status() -> dict:
    """Cheap plausibility check for the AI keys used by the analysis layer.

    Real Anthropic keys look like `sk-ant-api03-...` (~100+ chars). Real Voyage
    keys are at least ~30 chars and start with `pa-`. We flag anything shorter
    or obviously-placeholder as missing so the home-page banner can prompt the
    operator to set them before analysis can run.
    """
    ak = (settings.anthropic_api_key or "").strip()
    vk = (settings.voyage_api_key or "").strip()
    anthropic_ok = ak.startswith("sk-ant-") and len(ak) >= 40
    voyage_ok = vk.startswith("pa-") and len(vk) >= 20
    return {
        "anthropic_ok": anthropic_ok,
        "voyage_ok": voyage_ok,
        "any_missing": not (anthropic_ok and voyage_ok),
    }


@router.get("/", response_class=HTMLResponse)
def home(request: Request, db: Session = Depends(get_db)) -> HTMLResponse:
    """Home page. Multiple rails so different slices of the corpus all get
    airtime even when one high-volume feed dominates the global timeline."""
    base_query = db.query(Document).options(
        joinedload(Document.source), joinedload(Document.analysis)
    )

    # --- Rail 1: latest across everything ---
    latest_docs = (
        base_query.order_by(
            desc(Document.published_at), desc(Document.fetched_at)
        )
        .limit(30)
        .all()
    )

    # --- Rail 2: Arabic-language analyses (think tanks, official) ---
    arabic_docs = (
        base_query.filter(Document.language == "ar")
        .order_by(desc(Document.published_at), desc(Document.fetched_at))
        .limit(12)
        .all()
    )

    # --- Rail 3: Think-tank and research-center output ---
    think_tank_docs = (
        base_query.join(Source, Document.source_id == Source.id)
        .filter(Source.category.in_(("think_tank", "specialized", "university")))
        .order_by(desc(Document.published_at), desc(Document.fetched_at))
        .limit(12)
        .all()
    )

    # --- Rail 4: Long-form analytical media ---
    media_docs = (
        base_query.join(Source, Document.source_id == Source.id)
        .filter(Source.category.in_(("media", "think_tank_media")))
        .order_by(desc(Document.published_at), desc(Document.fetched_at))
        .limit(12)
        .all()
    )

    source_count = db.query(Source).filter(Source.active.is_(True)).count()
    document_count = db.query(Document).count()
    arabic_count = db.query(Document).filter(Document.language == "ar").count()
    english_count = db.query(Document).filter(Document.language == "en").count()
    analyzed_count = (
        db.query(Document).filter(Document.analysis_status == "done").count()
    )
    pending_count = (
        db.query(Document).filter(Document.analysis_status == "pending").count()
    )

    by_category = dict(
        db.query(Source.category, func.count())
        .filter(Source.active.is_(True))
        .group_by(Source.category)
        .all()
    )
    by_tier = dict(
        db.query(Source.priority, func.count())
        .filter(Source.active.is_(True))
        .group_by(Source.priority)
        .all()
    )

    return templates.TemplateResponse(
        request,
        "home.html",
        {
            "latest_docs": latest_docs,
            "arabic_docs": arabic_docs,
            "think_tank_docs": think_tank_docs,
            "media_docs": media_docs,
            "source_count": source_count,
            "document_count": document_count,
            "arabic_count": arabic_count,
            "english_count": english_count,
            "analyzed_count": analyzed_count,
            "pending_count": pending_count,
            "keys_status": _key_status(),
            "by_category": by_category,
            "by_tier": by_tier,
        },
    )


@router.get("/sources", response_class=HTMLResponse)
def sources_page(request: Request, db: Session = Depends(get_db)) -> HTMLResponse:
    sources = (
        db.query(Source)
        .filter(Source.active.is_(True))
        .order_by(Source.priority.asc(), Source.name.asc())
        .all()
    )
    return templates.TemplateResponse(
        request,
        "sources.html",
        {"sources": sources},
    )
