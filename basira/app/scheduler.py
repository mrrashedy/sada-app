"""APScheduler — background jobs for ingestion and analysis.

This is the "engine" of Basira's continuous loop. Poll jobs are registered
per tier; analysis and embedding queues are drained on a short cycle. All
jobs run inside the same Python process as the FastAPI app — no Celery,
no Redis.

Jobs are idempotent and safe to coalesce. `max_instances=1` ensures a slow
job never overlaps with its next scheduled fire.
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings
from app.db import session_scope

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


# ---------- Job bodies ----------
# Each job opens its own DB session via session_scope(). Jobs are resilient:
# an exception in one source's ingestion is logged but never stops the job.


def poll_tier_1() -> None:
    """Poll Tier 1 sources. Runs hourly."""
    from app.ingest.pipeline import ingest_by_tier

    logger.info("scheduler: poll_tier_1 starting")
    try:
        with session_scope() as db:
            result = ingest_by_tier(db, "Tier 1", max_sources=60)
        logger.info(
            "scheduler: poll_tier_1 done — polled=%d found=%d new=%d",
            result.get("sources_polled", 0),
            result.get("found", 0),
            result.get("new", 0),
        )
    except Exception as e:  # pragma: no cover
        logger.exception("scheduler: poll_tier_1 failed: %s", e)


def poll_tier_2() -> None:
    """Poll Tier 2 sources. Runs every 3 hours."""
    from app.ingest.pipeline import ingest_by_tier

    logger.info("scheduler: poll_tier_2 starting")
    try:
        with session_scope() as db:
            result = ingest_by_tier(db, "Tier 2", max_sources=110)
        logger.info(
            "scheduler: poll_tier_2 done — polled=%d found=%d new=%d",
            result.get("sources_polled", 0),
            result.get("found", 0),
            result.get("new", 0),
        )
    except Exception as e:  # pragma: no cover
        logger.exception("scheduler: poll_tier_2 failed: %s", e)


def poll_tier_3() -> None:
    """Poll Tier 3 sources. Runs every 12 hours."""
    from app.ingest.pipeline import ingest_by_tier

    logger.info("scheduler: poll_tier_3 starting")
    try:
        with session_scope() as db:
            result = ingest_by_tier(db, "Tier 3", max_sources=160)
        logger.info(
            "scheduler: poll_tier_3 done — polled=%d found=%d new=%d",
            result.get("sources_polled", 0),
            result.get("found", 0),
            result.get("new", 0),
        )
    except Exception as e:  # pragma: no cover
        logger.exception("scheduler: poll_tier_3 failed: %s", e)


def drain_analysis_queue() -> None:
    """Pull up to 10 pending documents and run Claude analysis on them.

    Skips silently if ANTHROPIC_API_KEY is not configured — the ingestion
    side of the loop still works without it.
    """
    if (
        not settings.anthropic_api_key
        or settings.anthropic_api_key.startswith("sk-ant-...")
    ):
        return

    from app.analyze.pipeline import analyze_document
    from app.models.document import Document

    try:
        with session_scope() as db:
            pending = (
                db.query(Document)
                .filter(Document.analysis_status == "pending")
                .order_by(Document.fetched_at.asc())
                .limit(10)
                .all()
            )
            doc_ids = [d.id for d in pending]
        if not doc_ids:
            return
        logger.info("scheduler: drain_analysis_queue — %d docs", len(doc_ids))
        for doc_id in doc_ids:
            try:
                with session_scope() as db:
                    analyze_document(db, doc_id)
            except Exception as e:
                logger.warning("analysis failed for doc %d: %s", doc_id, e)
    except Exception as e:  # pragma: no cover
        logger.exception("scheduler: drain_analysis_queue crashed: %s", e)


# ---------- Scheduler lifecycle ----------


def start_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    _scheduler = BackgroundScheduler(
        job_defaults={
            "coalesce": True,
            "max_instances": 1,
            "misfire_grace_time": 600,
        },
    )

    # Tier-based ingestion cadence. First fire is staggered so the three tiers
    # don't all hit the DB in the same minute when the server boots.
    _scheduler.add_job(
        poll_tier_1,
        "interval",
        minutes=60,
        id="poll_tier_1",
        next_run_time=_now_plus_seconds(30),
    )
    _scheduler.add_job(
        poll_tier_2,
        "interval",
        hours=3,
        id="poll_tier_2",
        next_run_time=_now_plus_seconds(300),
    )
    _scheduler.add_job(
        poll_tier_3,
        "interval",
        hours=12,
        id="poll_tier_3",
        next_run_time=_now_plus_seconds(900),
    )

    # Analysis drains the pending queue every 5 minutes. Cheap when the queue
    # is empty; bounded when it's full (max 10 docs per tick).
    _scheduler.add_job(
        drain_analysis_queue,
        "interval",
        minutes=5,
        id="analyze_queue",
        next_run_time=_now_plus_seconds(120),
    )

    _scheduler.start()
    logger.info(
        "scheduler started with %d jobs: %s",
        len(_scheduler.get_jobs()),
        [j.id for j in _scheduler.get_jobs()],
    )
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("scheduler stopped")


def _now_plus_seconds(n: int):
    """Absolute datetime `n` seconds from now, for staggered first-fire."""
    from datetime import datetime, timedelta

    return datetime.now() + timedelta(seconds=n)
