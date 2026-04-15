"""Basira — FastAPI entry point.

Composes routers, middleware, and startup hooks. Run with:

    uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import admin, documents, sources, topics
from app.config import settings
from app.db import Base, engine, init_vector_table, session_scope
from app.ingest.loader import load_sources
from app.web import dashboard as web_dashboard
from app.web import routes as web_routes

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("basira")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup + shutdown hooks."""
    logger.info("basira starting — db=%s", settings.db_path)
    settings.ensure_dirs()

    # Make sure the schema is present (safe even if alembic already ran).
    Base.metadata.create_all(engine)
    init_vector_table()

    # Load sources from the master CSV.
    try:
        with session_scope() as db:
            result = load_sources(db)
        logger.info(
            "sources loaded: total=%d inserted=%d updated=%d deactivated=%d",
            result.total_rows,
            result.inserted,
            result.updated,
            result.deactivated,
        )
    except Exception as e:  # pragma: no cover
        logger.exception("failed to load sources at startup: %s", e)

    # Scheduler is wired in Phase 2 of the plan. For now we just log intent.
    if settings.scheduler_enabled:
        try:
            from app.scheduler import start_scheduler

            start_scheduler()
            logger.info("scheduler started")
        except Exception as e:  # pragma: no cover
            logger.warning("scheduler not started: %s", e)
    else:
        logger.info("scheduler disabled (BASIRA_SCHEDULER_ENABLED=0)")

    yield

    logger.info("basira shutting down")
    try:
        from app.scheduler import stop_scheduler

        stop_scheduler()
    except Exception:  # pragma: no cover
        pass


app = FastAPI(
    title="Basira",
    description=(
        "An independent geopolitical research engine. Monitors think tanks, "
        "official sources, multilaterals, universities, long-form media, "
        "datasets, and conferences. Produces structured analytical scaffolding "
        "via Claude. Educate, don't alert."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# ---- CORS ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Engine-Version"],
)


@app.middleware("http")
async def add_engine_version_header(request, call_next):
    """Every response carries an engine version so clients (Sada) can detect
    breaking changes early."""
    response = await call_next(request)
    response.headers["X-Engine-Version"] = "basira/0.1.0"
    return response


# ---- API routers (JSON) ----
app.include_router(sources.router, prefix="/api/sources", tags=["sources"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(topics.router, prefix="/api/topics", tags=["topics"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])


# ---- Reader UI (server-rendered HTML) ----
app.include_router(web_routes.router)
app.include_router(web_dashboard.router)

static_dir = Path(__file__).resolve().parent / "web" / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


# ---- Health endpoint ----
@app.get("/api/health")
def health() -> dict:
    """Liveness check. No DB access, no external calls."""
    return {
        "ok": True,
        "service": "basira",
        "version": "0.1.0",
        "editorial_principle": (
            "Less emotional, more logical. Less spotlight, more enlightenment. "
            "Educate, don't alert."
        ),
    }


@app.exception_handler(404)
async def not_found(_request, exc):
    return JSONResponse(
        status_code=404,
        content={"error": "not_found", "detail": str(exc.detail) if hasattr(exc, "detail") else None},
    )
