"""Ingestion orchestrator.

For one source, walks the strategy tree:
  1. If source has RSS feeds configured → rss.fetch_source.
  2. Else → universal_fallback.fetch_source.
  3. Dedupe against existing documents.
  4. Apply the quality gate (see `_passes_quality_gate`): reject anything
     too short, too nav-like, or too obviously a menu/section index.
  5. Persist new candidates with analysis_status = 'pending'.
  6. Log an IngestRun row capturing success/failure and counts.

Category-aware document_type is assigned based on source.category so
downstream reporting is coherent.

The quality gate is deliberately strict. Basira is an analytical engine,
not a content platform — it is better to drop a borderline candidate than
to pollute the corpus with a headline, a nav anchor, or a menu entry. The
downstream Claude analysis cannot decompose text that isn't an argument.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime

from sqlalchemy.orm import Session

from app.ingest import rss, universal_fallback
from app.ingest.dedupe import canonicalize_url, make_dedupe_hash
from app.ingest.rss import CandidateDocument
from app.models.document import Document
from app.models.ingest_run import IngestRun
from app.models.source import Source

logger = logging.getLogger(__name__)


# ---------- Quality gate ----------

# Minimum body length (chars) to be considered an argument worth analyzing.
# Official statements and data notes get a lower bar because their "argument"
# is inherently compact; think-tank output is held to a higher standard.
MIN_BODY_CHARS_BY_CATEGORY: dict[str, int] = {
    "think_tank": 800,
    "university": 800,
    "specialized": 800,
    "think_tank_media": 800,
    "media": 800,
    "multilateral": 600,
    "conference": 600,
    "official": 300,
    "data": 200,
}

# Titles that are obviously nav/menu/template placeholders rather than documents.
# Universal fallback in particular tends to discover things like "Publications",
# "Media Center", "News", "Research papers" — these are category pages, not
# documents. Reject at the door.
NAV_TITLE_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in (
        r"^\s*(publications?|reports?|news|research|articles?|analyses?|"
        r"commentar(?:y|ies)|op-?eds?|media center|press releases?|"
        r"press room|working papers?|research papers?|papers?|home|about|"
        r"events?|about us|contact|newsletter|subscribe|sign in|log in|"
        r"dashboard|menu|search|more|all|browse)\s*$",
        r"^hello world!?$",  # WordPress default demo post
        r"^الروابط الرئيسية$",  # Arabic "main links" nav
        r"^main links$",
        r"^(media|press)\s*(center|room)$",
    )
]


def _passes_quality_gate(cand: CandidateDocument, category: str) -> tuple[bool, str]:
    """Return (accepted, reason). `reason` is a short string for logging."""
    title = (cand.title or "").strip()
    body = (cand.body or "").strip()

    if not title:
        return False, "no_title"
    if len(title) < 10:
        return False, "title_too_short"

    # Title-based nav/menu filter.
    for pat in NAV_TITLE_PATTERNS:
        if pat.match(title):
            return False, "nav_title"

    min_body = MIN_BODY_CHARS_BY_CATEGORY.get(category, 800)
    if len(body) < min_body:
        return False, f"body_under_{min_body}"

    # Reject documents that are mostly the title repeated (common for pages
    # where trafilatura fails and falls back to picking up the nav).
    if body and title and title.lower() in body.lower():
        # If the title is >40% of the body, something's wrong.
        if len(title) / max(len(body), 1) > 0.4:
            return False, "title_dominates_body"

    return True, "ok"


# Unicode ranges used by Arabic script (main block + Arabic Supplement +
# Arabic Extended-A). Used for cheap language sniffing when RSS/trafilatura
# don't supply a lang tag. Good enough for the dashboard's language column;
# not meant to replace proper language detection.
_ARABIC_CHARS = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]")


def _sniff_language(text: str | None) -> str | None:
    """Return 'ar' if the text is predominantly Arabic script, 'en' if it's
    clearly Latin, otherwise None."""
    if not text:
        return None
    sample = text[:2000]
    arabic = len(_ARABIC_CHARS.findall(sample))
    latin = sum(1 for ch in sample if "a" <= ch.lower() <= "z")
    total = arabic + latin
    if total < 20:
        return None
    if arabic > latin:
        return "ar"
    if latin > arabic * 3:
        return "en"
    return None


def _resolve_language(
    raw_lang: str | None, title: str | None, body: str | None
) -> str | None:
    """Normalize whatever language hint we have, falling back to character sniff."""
    if raw_lang:
        # feedparser / trafilatura often hand us things like "en-US", "ar",
        # "ar-SA", "en". Snap to a two-letter code.
        code = raw_lang.strip().lower().replace("_", "-").split("-")[0]
        if code in ("en", "ar", "fr", "de", "es", "zh", "ru", "tr", "pt", "it", "he", "fa", "ur"):
            return code
    return _sniff_language((title or "") + " " + (body or ""))


CATEGORY_TO_DOCTYPE: dict[str, str] = {
    "think_tank": "paper",
    "university": "paper",
    "specialized": "report",
    "official": "statement",
    "multilateral": "report",
    "media": "long_form_article",
    "think_tank_media": "long_form_article",
    "data": "dataset_release",
    "conference": "conference_proceedings",
}


def doctype_for(category: str) -> str:
    return CATEGORY_TO_DOCTYPE.get(category, "paper")


def ingest_source(db: Session, source_id: int, *, max_new: int = 20) -> dict:
    """Poll one source, persist new documents, return a summary dict."""
    src = db.query(Source).filter_by(id=source_id).one_or_none()
    if not src:
        return {"ok": False, "error": "source not found"}

    run = IngestRun(source_id=src.id, strategy=src.scrape_strategy or "universal_fallback")
    db.add(run)
    db.flush()

    try:
        # Pick a strategy.
        if src.feeds_json:
            strategy = "rss"
            candidates = rss.fetch_source(src, limit=max_new * 2)
        else:
            strategy = "universal_fallback"
            candidates = universal_fallback.fetch_source(src, max_docs=max_new)

        run.strategy = strategy
        run.documents_found = len(candidates)

        new_count = 0
        rejected_count = 0
        reject_reasons: dict[str, int] = {}
        for cand in candidates:
            if not cand.canonical_url or not cand.title:
                rejected_count += 1
                reject_reasons["no_url_or_title"] = reject_reasons.get("no_url_or_title", 0) + 1
                continue

            # Quality gate — analytical engine, not content platform.
            accepted, reason = _passes_quality_gate(cand, src.category)
            if not accepted:
                rejected_count += 1
                reject_reasons[reason] = reject_reasons.get(reason, 0) + 1
                logger.debug(
                    "quality_gate rejected %s: %s (%r)",
                    src.slug, reason, cand.title[:60] if cand.title else None,
                )
                continue

            url = canonicalize_url(cand.canonical_url)
            dedupe = make_dedupe_hash(url, cand.title, cand.body)

            existing = (
                db.query(Document).filter_by(dedupe_hash=dedupe).one_or_none()
            )
            if existing is not None:
                continue

            language = _resolve_language(cand.language, cand.title, cand.body)
            doc = Document(
                source_id=src.id,
                canonical_url=url,
                dedupe_hash=dedupe,
                document_type=doctype_for(src.category),
                title=cand.title[:1000],
                authors_json=cand.authors or None,
                abstract=cand.abstract,
                body=cand.body,
                language=language,
                published_at=cand.published_at,
                fetched_at=datetime.utcnow(),
                analysis_status="pending",
                raw_metadata_json=cand.raw or None,
            )
            db.add(doc)
            new_count += 1
            if new_count >= max_new:
                break

        run.documents_new = new_count
        # Record rejection breakdown in the run's error column for debugging
        # even on successful runs — the ingest_runs table becomes a quality
        # monitor, not just a uptime monitor.
        if rejected_count > 0:
            reject_summary = ", ".join(f"{k}={v}" for k, v in reject_reasons.items())
            run.error = f"quality_gate: {rejected_count} rejected ({reject_summary})"
        run.status = "success" if new_count > 0 else "empty"
        run.finished_at = datetime.utcnow()

        src.last_polled_at = datetime.utcnow()
        if new_count > 0:
            src.last_seen_at = datetime.utcnow()

        db.commit()

        logger.info(
            "ingested %s [%s]: found=%d new=%d",
            src.slug,
            strategy,
            len(candidates),
            new_count,
        )

        return {
            "ok": True,
            "source": src.slug,
            "strategy": strategy,
            "found": len(candidates),
            "new": new_count,
        }
    except Exception as e:
        logger.exception("ingest_source failed for %s: %s", src.slug, e)
        run.status = "error"
        run.error = str(e)[:2000]
        run.finished_at = datetime.utcnow()
        src.last_polled_at = datetime.utcnow()
        db.commit()
        return {"ok": False, "source": src.slug, "error": str(e)}


def ingest_by_tier(db: Session, priority: str, *, max_sources: int = 50) -> dict:
    """Poll up to `max_sources` active sources of a given tier."""
    sources = (
        db.query(Source)
        .filter(Source.priority == priority, Source.active.is_(True))
        .order_by(Source.last_polled_at.asc().nullsfirst())
        .limit(max_sources)
        .all()
    )

    total_found = 0
    total_new = 0
    per_source: list[dict] = []
    for s in sources:
        result = ingest_source(db, s.id, max_new=15)
        per_source.append(result)
        total_found += result.get("found", 0) if result.get("ok") else 0
        total_new += result.get("new", 0) if result.get("ok") else 0

    return {
        "ok": True,
        "priority": priority,
        "sources_polled": len(sources),
        "found": total_found,
        "new": total_new,
        "results": per_source,
    }
