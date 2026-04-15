"""Dashboard — browser-facing admin UI.

Separate from `/api/admin/*`. The JSON admin endpoints are authenticated
with a Bearer/header token for programmatic use; this file gives a human
operator a live HTML dashboard to drive the same operations from a browser.

Auth model: single-cookie. You visit `/dashboard`, get redirected to the
login form, paste the BASIRA_ADMIN_TOKEN, and the server sets an
HttpOnly cookie. All subsequent dashboard + dashboard-fragment routes
validate that cookie against `settings.admin_token`. HTMX fragments
reuse the same cookie automatically.

Page layout:
  /dashboard                      — full page shell (first load)
  /dashboard/login                — login form
  /dashboard/login (POST)         — accept token, set cookie, redirect
  /dashboard/logout (POST)        — clear cookie

HTMX fragments (swapped into the page):
  /dashboard/fragments/overview       — totals cards
  /dashboard/fragments/recent-runs    — last 20 ingest runs
  /dashboard/fragments/pending-docs   — last 20 pending documents
  /dashboard/fragments/sources-grid   — per-source health grid

Actions (return a small result fragment for HTMX swap):
  POST /dashboard/actions/reload-sources
  POST /dashboard/actions/refresh/{slug}
  POST /dashboard/actions/analyze/{doc_id}
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Form, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import desc, func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db import get_db
from app.ingest.loader import load_sources
from app.ingest.pipeline import ingest_source
from app.models.document import Document
from app.models.ingest_run import IngestRun
from app.models.source import Source

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

router = APIRouter()

# Cookie name used for dashboard auth. Kept distinct from any Supabase cookies
# so the two auth worlds can coexist when Sada integration happens.
COOKIE_NAME = "basira_admin"


# ---------- Auth helpers ----------


def _token_configured() -> bool:
    t = settings.admin_token or ""
    return bool(t) and t != "changeme"


def _valid_cookie(cookie_value: str | None) -> bool:
    if not _token_configured():
        return False
    return cookie_value is not None and cookie_value == settings.admin_token


def require_dashboard_cookie(
    basira_admin: Annotated[str | None, Cookie()] = None,
) -> None:
    """Dependency that rejects requests without a valid admin cookie.

    Used on every dashboard fragment and action. For the top-level `/dashboard`
    page we do NOT use this dependency — we check manually and redirect to
    `/dashboard/login` instead of returning a 401.
    """
    if not _token_configured():
        raise HTTPException(
            status_code=503,
            detail="admin token not configured — set BASIRA_ADMIN_TOKEN in .env",
        )
    if not _valid_cookie(basira_admin):
        raise HTTPException(status_code=401, detail="unauthorized")


# ---------- Page shell ----------


@router.get("/dashboard", response_class=HTMLResponse)
def dashboard_page(
    request: Request,
    basira_admin: Annotated[str | None, Cookie()] = None,
    db: Session = Depends(get_db),
) -> HTMLResponse:
    """Full-page dashboard. Redirects to login if the cookie is missing."""
    if not _token_configured():
        return templates.TemplateResponse(
            request,
            "dashboard_login.html",
            {
                "error": (
                    "admin token not configured — set BASIRA_ADMIN_TOKEN in .env "
                    "and restart the server."
                ),
                "show_form": False,
            },
            status_code=503,
        )
    if not _valid_cookie(basira_admin):
        return RedirectResponse("/dashboard/login", status_code=status.HTTP_302_FOUND)

    # First-load snapshot — same data the fragments serve, rendered inline so
    # the page is useful before the HTMX triggers fire.
    overview = _build_overview(db)
    recent_runs = _build_recent_runs(db)
    pending_docs = _build_pending_docs(db)
    sources_grid = _build_sources_grid(db)

    return templates.TemplateResponse(
        request,
        "dashboard.html",
        {
            "overview": overview,
            "recent_runs": recent_runs,
            "pending_docs": pending_docs,
            "sources_grid": sources_grid,
        },
    )


@router.get("/dashboard/login", response_class=HTMLResponse)
def dashboard_login_form(request: Request) -> HTMLResponse:
    if not _token_configured():
        return templates.TemplateResponse(
            request,
            "dashboard_login.html",
            {
                "error": (
                    "admin token not configured — set BASIRA_ADMIN_TOKEN in .env "
                    "and restart the server."
                ),
                "show_form": False,
            },
            status_code=503,
        )
    return templates.TemplateResponse(
        request, "dashboard_login.html", {"error": None, "show_form": True}
    )


@router.post("/dashboard/login")
def dashboard_login_submit(
    request: Request,
    token: Annotated[str, Form()],
) -> HTMLResponse:
    if not _token_configured():
        return templates.TemplateResponse(
            request,
            "dashboard_login.html",
            {
                "error": "admin token not configured — set BASIRA_ADMIN_TOKEN in .env.",
                "show_form": False,
            },
            status_code=503,
        )
    if token.strip() != settings.admin_token:
        return templates.TemplateResponse(
            request,
            "dashboard_login.html",
            {"error": "invalid token", "show_form": True},
            status_code=401,
        )
    resp = RedirectResponse("/dashboard", status_code=status.HTTP_302_FOUND)
    resp.set_cookie(
        key=COOKIE_NAME,
        value=settings.admin_token,
        httponly=True,
        samesite="lax",
        # 7 days. The admin is not an anonymous user; long expiry is fine for
        # a self-hosted tool.
        max_age=60 * 60 * 24 * 7,
    )
    return resp


@router.post("/dashboard/logout")
def dashboard_logout() -> RedirectResponse:
    resp = RedirectResponse("/dashboard/login", status_code=status.HTTP_302_FOUND)
    resp.delete_cookie(COOKIE_NAME)
    return resp


# ---------- Fragment builders ----------


def _build_overview(db: Session) -> dict:
    total_sources = db.query(Source).count()
    active_sources = db.query(Source).filter(Source.active.is_(True)).count()
    never_polled = (
        db.query(Source)
        .filter(Source.active.is_(True), Source.last_polled_at.is_(None))
        .count()
    )

    total_docs = db.query(Document).count()
    by_status = dict(
        db.query(Document.analysis_status, func.count())
        .group_by(Document.analysis_status)
        .all()
    )

    run_status = dict(
        db.query(IngestRun.status, func.count()).group_by(IngestRun.status).all()
    )

    return {
        "total_sources": total_sources,
        "active_sources": active_sources,
        "never_polled": never_polled,
        "total_docs": total_docs,
        "docs_done": by_status.get("done", 0),
        "docs_pending": by_status.get("pending", 0),
        "docs_failed": by_status.get("failed", 0),
        "docs_skipped": by_status.get("skipped", 0),
        "runs_success": run_status.get("success", 0),
        "runs_empty": run_status.get("empty", 0),
        "runs_error": run_status.get("error", 0),
        "analyze_tiers": settings.analyze_tiers,
        "anthropic_configured": bool(
            settings.anthropic_api_key
            and not settings.anthropic_api_key.startswith("sk-ant-...")
        ),
        "voyage_configured": bool(
            settings.voyage_api_key and not settings.voyage_api_key.startswith("pa-")
        ) or bool(settings.voyage_api_key),
    }


def _build_recent_runs(db: Session, limit: int = 20) -> list[dict]:
    rows = (
        db.query(IngestRun)
        .options(joinedload(IngestRun.source))
        .order_by(desc(IngestRun.started_at))
        .limit(limit)
        .all()
    )
    out: list[dict] = []
    for r in rows:
        duration_ms: int | None = None
        if r.finished_at and r.started_at:
            duration_ms = int((r.finished_at - r.started_at).total_seconds() * 1000)
        out.append(
            {
                "id": r.id,
                "source_name": r.source.name if r.source else "—",
                "source_slug": r.source.slug if r.source else "",
                "strategy": r.strategy or "—",
                "status": r.status,
                "found": r.documents_found,
                "new": r.documents_new,
                "started_at": r.started_at,
                "duration_ms": duration_ms,
                "error": (r.error or "")[:200],
            }
        )
    return out


def _build_pending_docs(db: Session, limit: int = 20) -> list[dict]:
    rows = (
        db.query(Document)
        .options(joinedload(Document.source))
        .filter(Document.analysis_status == "pending")
        .order_by(desc(Document.fetched_at))
        .limit(limit)
        .all()
    )
    return [
        {
            "id": d.id,
            "title": d.title,
            "source_name": d.source.name if d.source else "—",
            "category": d.source.category if d.source else "",
            "priority": d.source.priority if d.source else "",
            "fetched_at": d.fetched_at,
        }
        for d in rows
    ]


def _build_sources_grid(db: Session) -> list[dict]:
    """One row per active source, with a health color."""
    rows = (
        db.query(Source)
        .filter(Source.active.is_(True))
        .order_by(Source.priority.asc(), Source.name.asc())
        .all()
    )

    # Most recent run per source, in one pass
    latest_subq = (
        db.query(
            IngestRun.source_id.label("sid"),
            func.max(IngestRun.started_at).label("last_started"),
        )
        .group_by(IngestRun.source_id)
        .subquery()
    )
    latest_map_rows = (
        db.query(IngestRun)
        .join(
            latest_subq,
            (IngestRun.source_id == latest_subq.c.sid)
            & (IngestRun.started_at == latest_subq.c.last_started),
        )
        .all()
    )
    latest_by_source = {r.source_id: r for r in latest_map_rows}

    doc_counts = dict(
        db.query(Document.source_id, func.count())
        .group_by(Document.source_id)
        .all()
    )

    out: list[dict] = []
    for s in rows:
        latest = latest_by_source.get(s.id)
        if latest is None:
            health = "grey"  # never polled
        elif latest.status == "error":
            health = "red"
        elif latest.status == "empty":
            health = "yellow"
        elif latest.status == "success":
            health = "green"
        else:
            health = "grey"
        out.append(
            {
                "id": s.id,
                "slug": s.slug,
                "name": s.name,
                "category": s.category,
                "priority": s.priority,
                "region": s.region,
                "strategy": s.scrape_strategy,
                "last_polled_at": s.last_polled_at,
                "last_seen_at": s.last_seen_at,
                "health": health,
                "last_status": latest.status if latest else None,
                "last_error": (latest.error or "")[:160] if latest else None,
                "doc_count": doc_counts.get(s.id, 0),
                "has_feeds": bool(s.feeds_json),
            }
        )
    return out


# ---------- Fragment endpoints (HTMX polls these) ----------


@router.get(
    "/dashboard/fragments/overview",
    response_class=HTMLResponse,
    dependencies=[Depends(require_dashboard_cookie)],
)
def fragment_overview(request: Request, db: Session = Depends(get_db)) -> HTMLResponse:
    return templates.TemplateResponse(
        request,
        "dashboard_overview.html",
        {"overview": _build_overview(db)},
    )


@router.get(
    "/dashboard/fragments/recent-runs",
    response_class=HTMLResponse,
    dependencies=[Depends(require_dashboard_cookie)],
)
def fragment_recent_runs(
    request: Request, db: Session = Depends(get_db)
) -> HTMLResponse:
    return templates.TemplateResponse(
        request,
        "dashboard_recent_runs.html",
        {"recent_runs": _build_recent_runs(db)},
    )


@router.get(
    "/dashboard/fragments/pending-docs",
    response_class=HTMLResponse,
    dependencies=[Depends(require_dashboard_cookie)],
)
def fragment_pending_docs(
    request: Request, db: Session = Depends(get_db)
) -> HTMLResponse:
    return templates.TemplateResponse(
        request,
        "dashboard_pending_docs.html",
        {"pending_docs": _build_pending_docs(db)},
    )


@router.get(
    "/dashboard/fragments/sources-grid",
    response_class=HTMLResponse,
    dependencies=[Depends(require_dashboard_cookie)],
)
def fragment_sources_grid(
    request: Request,
    category: str | None = None,
    priority: str | None = None,
    health: str | None = None,
    db: Session = Depends(get_db),
) -> HTMLResponse:
    grid = _build_sources_grid(db)
    if category:
        grid = [g for g in grid if g["category"] == category]
    if priority:
        grid = [g for g in grid if g["priority"] == priority]
    if health:
        grid = [g for g in grid if g["health"] == health]
    return templates.TemplateResponse(
        request,
        "dashboard_sources_grid.html",
        {"sources_grid": grid},
    )


# ---------- Actions ----------


def _render_action_result(
    request: Request,
    *,
    ok: bool,
    title: str,
    detail: str,
) -> HTMLResponse:
    return templates.TemplateResponse(
        request,
        "dashboard_action_result.html",
        {"ok": ok, "title": title, "detail": detail},
    )


@router.post(
    "/dashboard/actions/reload-sources",
    response_class=HTMLResponse,
    dependencies=[Depends(require_dashboard_cookie)],
)
def action_reload_sources(
    request: Request, db: Session = Depends(get_db)
) -> HTMLResponse:
    try:
        result = load_sources(db)
        db.commit()
        return _render_action_result(
            request,
            ok=True,
            title="sources reloaded",
            detail=(
                f"total={result.total_rows} inserted={result.inserted} "
                f"updated={result.updated} deactivated={result.deactivated}"
            ),
        )
    except Exception as e:
        logger.exception("reload_sources failed: %s", e)
        return _render_action_result(
            request, ok=False, title="reload failed", detail=str(e)[:400]
        )


@router.post(
    "/dashboard/actions/refresh/{slug}",
    response_class=HTMLResponse,
    dependencies=[Depends(require_dashboard_cookie)],
)
def action_refresh_source(
    request: Request, slug: str, db: Session = Depends(get_db)
) -> HTMLResponse:
    src = db.query(Source).filter_by(slug=slug).one_or_none()
    if not src:
        return _render_action_result(
            request, ok=False, title="not found", detail=f"source {slug} not in DB"
        )
    try:
        result = ingest_source(db, src.id, max_new=15)
    except Exception as e:
        logger.exception("refresh failed for %s: %s", slug, e)
        return _render_action_result(
            request, ok=False, title=f"refresh failed: {slug}", detail=str(e)[:400]
        )
    if not result.get("ok"):
        return _render_action_result(
            request,
            ok=False,
            title=f"refresh failed: {slug}",
            detail=result.get("error", "unknown")[:400],
        )
    return _render_action_result(
        request,
        ok=True,
        title=f"refreshed: {slug}",
        detail=(
            f"strategy={result.get('strategy')} "
            f"found={result.get('found', 0)} "
            f"new={result.get('new', 0)}"
        ),
    )


@router.post(
    "/dashboard/actions/analyze/{doc_id}",
    response_class=HTMLResponse,
    dependencies=[Depends(require_dashboard_cookie)],
)
def action_analyze_document(
    request: Request, doc_id: int, db: Session = Depends(get_db)
) -> HTMLResponse:
    doc = db.query(Document).filter_by(id=doc_id).one_or_none()
    if not doc:
        return _render_action_result(
            request, ok=False, title="not found", detail=f"document {doc_id} not in DB"
        )
    if (
        not settings.anthropic_api_key
        or settings.anthropic_api_key.startswith("sk-ant-...")
    ):
        return _render_action_result(
            request,
            ok=False,
            title="analysis unavailable",
            detail="ANTHROPIC_API_KEY not configured in .env",
        )

    try:
        from app.analyze.pipeline import analyze_document

        analysis = analyze_document(db, doc_id, force=True)
    except Exception as e:
        logger.exception("analyze failed for doc %d: %s", doc_id, e)
        return _render_action_result(
            request,
            ok=False,
            title=f"analyze failed: doc {doc_id}",
            detail=str(e)[:400],
        )

    if analysis is None:
        return _render_action_result(
            request,
            ok=True,
            title=f"analyze skipped: doc {doc_id}",
            detail="source tier is not in BASIRA_ANALYZE_TIERS",
        )
    return _render_action_result(
        request,
        ok=True,
        title=f"analyzed: doc {doc_id}",
        detail=(
            f"variant={analysis.prompt_variant} "
            f"model={analysis.model} "
            f"in={analysis.input_tokens or 0} "
            f"out={analysis.output_tokens or 0}"
        ),
    )
