"""Basira one-shot worker.

The entrypoint that GitHub Actions runs on an hourly cron. Does one
ingest+analyze pass over all active sources, writes everything to
Supabase, and exits. No FastAPI server, no scheduler, no SQLite.

Usage:
    uv run python -m app.worker               # one pass, default limits
    uv run python -m app.worker --analyze-only # skip ingest, only drain pending
    uv run python -m app.worker --max-sources 20 --max-per-source 5

Environment variables:
    SUPABASE_URL                — your Supabase project URL
    SUPABASE_SERVICE_ROLE_KEY   — the service-role key (bypasses RLS, keep secret)
    ANTHROPIC_API_KEY           — optional; if unset, docs stay "pending"
    BASIRA_MAX_SOURCES          — optional cap on sources per run (default 999)
    BASIRA_MAX_PER_SOURCE       — optional cap on new docs per source (default 20)
    BASIRA_ANALYZE_BUDGET       — max docs to send to Claude this run (default 40)

The worker is designed to be idempotent and time-bounded so a bad run
can't burn the whole Claude budget. It deduplicates against Supabase
state on every pass, so running it twice in a row is safe.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone
from hashlib import sha256
from types import SimpleNamespace
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger("basira.worker")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def canonicalize_url(url: str) -> str:
    """Lowercase scheme+host, strip trailing slash, drop common tracking params.

    Same algorithm the existing SQLAlchemy pipeline uses. Copied here to
    keep the worker self-contained and not pull in app.db / app.models.
    """
    try:
        parsed = urlparse(url.strip())
        scheme = parsed.scheme.lower() or "https"
        netloc = parsed.netloc.lower()
        path = parsed.path.rstrip("/") or "/"
        return f"{scheme}://{netloc}{path}"
    except Exception:
        return url.strip()


def make_dedupe_hash(url: str, title: str, body: str | None) -> str:
    """SHA-256 over canonical_url + normalized title + first 500 chars of body.

    Matches the algorithm used in the SQLite pipeline so documents
    ingested via either path collide on the same hash.
    """
    t = (title or "").strip().lower()
    b = (body or "").strip().lower()[:500]
    raw = f"{url}\n{t}\n{b}".encode("utf-8", errors="ignore")
    return sha256(raw).hexdigest()


def doctype_for(category: str) -> str:
    """Map source category → default document_type. Mirrors pipeline.py."""
    return {
        "think_tank": "paper",
        "university": "paper",
        "specialized": "report",
        "official": "statement",
        "multilateral": "report",
        "media": "long_form_article",
        "think_tank_media": "long_form_article",
        "data": "dataset_release",
        "conference": "conference_proceedings",
    }.get(category, "paper")


def iso(dt: datetime | None) -> str | None:
    """Serialize a datetime for Supabase JSON. None-safe."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _source_as_ns(src_row: dict[str, Any]) -> SimpleNamespace:
    """Adapt a Supabase row into the duck-type the fetch_source functions
    expect. They only read .feeds_json, .slug, .url, .id on the model, so
    a plain namespace with those attributes is enough — no need to drag
    SQLAlchemy into the worker path."""
    return SimpleNamespace(
        id=src_row["id"],
        slug=src_row["slug"],
        url=src_row["url"],
        feeds_json=src_row.get("feeds_json") or [],
        category=src_row["category"],
        priority=src_row["priority"],
    )


# ---------------------------------------------------------------------------
# Ingest pass
# ---------------------------------------------------------------------------

def ingest_pass(
    *,
    max_sources: int,
    max_per_source: int,
) -> dict[str, int]:
    """Run one ingestion pass across active sources.

    Returns a summary dict: {"sources": N, "candidates": M, "inserted": K,
    "skipped_dedupe": X, "errors": Y}.
    """
    from app import supabase_store as store
    from app.ingest import rss, universal_fallback

    sources = store.sources_active()[:max_sources]
    known = store.known_dedupe_hashes()
    logger.info(
        "ingest pass: %d active sources, %d known hashes",
        len(sources),
        len(known),
    )

    summary = {
        "sources": len(sources),
        "candidates": 0,
        "inserted": 0,
        "skipped_dedupe": 0,
        "errors": 0,
    }

    for src_row in sources:
        src_ns = _source_as_ns(src_row)
        try:
            if src_row.get("feeds_json"):
                cands = rss.fetch_source(src_ns, limit=max_per_source * 2)
            else:
                cands = universal_fallback.fetch_source(src_ns, max_docs=max_per_source)
        except Exception as exc:
            logger.warning("fetch failed for %s: %s", src_ns.slug, exc)
            summary["errors"] += 1
            continue

        summary["candidates"] += len(cands)
        new_here = 0
        for cand in cands:
            if not cand.canonical_url or not cand.title:
                continue
            url = canonicalize_url(cand.canonical_url)
            dedupe = make_dedupe_hash(url, cand.title, cand.body)
            if dedupe in known:
                summary["skipped_dedupe"] += 1
                continue

            doc_row = {
                "source_id": src_ns.id,
                "canonical_url": url,
                "dedupe_hash": dedupe,
                "document_type": doctype_for(src_ns.category),
                "title": (cand.title or "")[:1000],
                "title_ar": None,
                "authors_json": cand.authors or None,
                "abstract": cand.abstract,
                "body": cand.body,
                "language": cand.language,
                "published_at": iso(cand.published_at),
                "fetched_at": iso(datetime.utcnow()),
                "analysis_status": "pending",
                "raw_metadata_json": cand.raw or None,
            }
            try:
                new_id = store.insert_document(doc_row)
            except Exception as exc:
                logger.warning("insert failed for %s: %s", url, exc)
                summary["errors"] += 1
                continue
            if new_id:
                known.add(dedupe)
                summary["inserted"] += 1
                new_here += 1
                if new_here >= max_per_source:
                    break

    return summary


# ---------------------------------------------------------------------------
# Analyze pass
# ---------------------------------------------------------------------------

def analyze_pass(*, budget: int) -> dict[str, int]:
    """Drain up to `budget` pending documents through Claude.

    Silently no-ops (returning zeros) if ANTHROPIC_API_KEY is unset, so
    the worker still runs on free tiers that only do ingestion. When
    the key is present, uses the minimal prompt variant (conclusion +
    optional quote) from app.analyze.minimal_prompt to keep per-doc
    cost in the $0.001–0.005 range.
    """
    from app import supabase_store as store

    if not os.environ.get("ANTHROPIC_API_KEY", "").strip():
        logger.info("no ANTHROPIC_API_KEY — skipping analyze pass")
        return {"analyzed": 0, "errors": 0, "skipped_no_key": 1}

    # Deferred imports so the worker can run with just pip-installed
    # supabase and no anthropic lib if analysis is off.
    from app.analyze.minimal_prompt import analyze_document_minimal

    pending = store.pending_documents(limit=budget)
    logger.info("analyze pass: %d pending (budget %d)", len(pending), budget)

    summary = {"analyzed": 0, "errors": 0, "skipped_no_key": 0}
    for doc in pending:
        try:
            result = analyze_document_minimal(doc)
        except Exception as exc:
            logger.warning("analysis failed for doc %s: %s", doc.get("id"), exc)
            store.mark_document_status(doc["id"], "error")
            summary["errors"] += 1
            continue

        analysis_row = {
            "document_id": doc["id"],
            "prompt_variant": "minimal",
            "analytical_conclusion": result.get("analytical_conclusion"),
            "key_quotes_json": result.get("key_quotes") or None,
            "model": result.get("model", "claude-haiku-4-5"),
            "prompt_version": "minimal-v2",
            "input_tokens": result.get("input_tokens"),
            "output_tokens": result.get("output_tokens"),
            "created_at": iso(datetime.utcnow()),
        }
        store.upsert_analysis(analysis_row)
        store.mark_document_status(doc["id"], "done")
        summary["analyzed"] += 1

    return summary


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def retry_errored_documents() -> dict[str, int]:
    """Find every depth_documents row with analysis_status='error' and
    flip it back to 'pending' so the next analyze pass picks it up.

    Used when an API outage (e.g. Anthropic credit-balance exhaustion,
    rate-limit storm, transient 5xx) marked a backlog of docs as failed.
    Triggered manually from the GH Actions UI: workflow_dispatch with
    mode=retry-errors.
    """
    sb = store.get_client()
    rows = (
        sb.table("depth_documents")
        .select("id")
        .eq("analysis_status", "error")
        .limit(5000)
        .execute()
    ).data or []
    ids = [r["id"] for r in rows]
    if not ids:
        logger.info("retry-errors: no errored docs found")
        return {"retried": 0}
    n = 0
    CHUNK = 100
    for i in range(0, len(ids), CHUNK):
        batch = ids[i : i + CHUNK]
        sb.table("depth_documents").update({"analysis_status": "pending"}).in_(
            "id", batch
        ).execute()
        n += len(batch)
    logger.info("retry-errors: %d errored docs requeued", n)
    return {"retried": n}


def reanalyze_language_mismatches() -> dict[str, int]:
    """Find docs whose source language is Arabic but whose existing
    analytical_conclusion is in English (no Arabic glyphs at all),
    then drop their analyses and requeue them. The next analyze pass
    will re-process them with the current language-aware prompt.

    Symmetric for English docs that came back in Arabic. We use a simple
    Arabic-codepoint scan because that's the bug we actually saw in
    production (Haiku translating Arabic → English by default).
    """
    import re
    AR = re.compile(r"[\u0600-\u06FF]")

    rows = store.documents_with_analyses(limit=5000)
    mismatched: list[int] = []
    for r in rows:
        lang = (r.get("language") or "").lower()
        analyses = r.get("depth_analyses")
        # Embedded join can return either a list or a single object
        if isinstance(analyses, list):
            analysis = analyses[0] if analyses else None
        else:
            analysis = analyses
        if not analysis:
            continue
        conclusion = analysis.get("analytical_conclusion") or ""
        if not conclusion:
            continue
        has_arabic = bool(AR.search(conclusion))
        is_arabic_doc = lang.startswith("ar")
        is_english_doc = lang.startswith("en")
        # Arabic source, no Arabic in conclusion → was translated to EN
        # English source, conclusion has Arabic → was translated to AR
        if (is_arabic_doc and not has_arabic) or (is_english_doc and has_arabic):
            mismatched.append(r["id"])

    n = store.requeue_for_analysis(mismatched)
    logger.info("reanalyze: %d language-mismatched docs requeued", n)
    return {"requeued": n}


def main() -> int:
    parser = argparse.ArgumentParser(description="Basira one-shot worker")
    parser.add_argument(
        "--analyze-only",
        action="store_true",
        help="skip ingestion, only drain pending analyses",
    )
    parser.add_argument(
        "--ingest-only",
        action="store_true",
        help="skip analysis, only poll sources",
    )
    parser.add_argument(
        "--retry-errors",
        action="store_true",
        help=(
            "find all docs with analysis_status='error' (typically "
            "left over from API outages, credit-balance failures, or "
            "transient network errors), flip them back to 'pending' "
            "and immediately drain them. Implies --analyze-only."
        ),
    )
    parser.add_argument(
        "--reanalyze-language-mismatches",
        action="store_true",
        help=(
            "find docs whose conclusion came back in the wrong language "
            "(Arabic source → English conclusion or vice versa), drop "
            "those analyses and requeue them. Implies --analyze-only."
        ),
    )
    parser.add_argument(
        "--max-sources",
        type=int,
        default=int(os.environ.get("BASIRA_MAX_SOURCES", "999")),
    )
    parser.add_argument(
        "--max-per-source",
        type=int,
        default=int(os.environ.get("BASIRA_MAX_PER_SOURCE", "20")),
    )
    parser.add_argument(
        "--analyze-budget",
        type=int,
        default=int(os.environ.get("BASIRA_ANALYZE_BUDGET", "40")),
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=os.environ.get("BASIRA_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    t0 = time.time()
    summary: dict[str, Any] = {"started_at": datetime.utcnow().isoformat()}

    # The reanalyze flag is a maintenance pass: skip ingest, run the
    # mismatch repair, then immediately drain the freshly-requeued docs
    # with the current prompt. Doing both in one workflow_dispatch run
    # means a single click in the GH Actions UI fixes the backlog.
    if args.retry_errors:
        logger.info("starting error-retry pass")
        summary["retry"] = retry_errored_documents()
        logger.info("starting analyze pass (budget=%d)", args.analyze_budget)
        summary["analyze"] = analyze_pass(budget=args.analyze_budget)
    elif args.reanalyze_language_mismatches:
        logger.info("starting language-mismatch repair pass")
        summary["repair"] = reanalyze_language_mismatches()
        logger.info("starting analyze pass (budget=%d)", args.analyze_budget)
        summary["analyze"] = analyze_pass(budget=args.analyze_budget)
    else:
        if not args.analyze_only:
            logger.info(
                "starting ingest pass (max_sources=%d max_per_source=%d)",
                args.max_sources,
                args.max_per_source,
            )
            summary["ingest"] = ingest_pass(
                max_sources=args.max_sources,
                max_per_source=args.max_per_source,
            )
        if not args.ingest_only:
            logger.info("starting analyze pass (budget=%d)", args.analyze_budget)
            summary["analyze"] = analyze_pass(budget=args.analyze_budget)

    summary["elapsed_seconds"] = round(time.time() - t0, 2)
    logger.info("worker finished: %s", summary)
    # Structured output so GH Actions can parse it if needed.
    print("SUMMARY:", summary, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
