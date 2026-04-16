"""Supabase storage layer for the depth vertical.

This module is the single gateway between Basira's ingestion/analysis code
and the Supabase Postgres tables (`depth_sources`, `depth_documents`,
`depth_analyses`). Everything else in the codebase can stay SQLAlchemy-free
by going through these helpers.

Why a dedicated module (instead of pointing SQLAlchemy at Supabase)?
  - The GitHub Actions cron worker needs to run without a local SQLite file
    and without a Postgres password — only SUPABASE_URL +
    SUPABASE_SERVICE_ROLE_KEY, which travel cleanly as repo secrets.
  - supabase-py's PostgREST client is synchronous, batches well, and handles
    upserts via on_conflict — exactly the two operations we need.
  - The existing SQLAlchemy layer stays in place for local dev and the FastAPI
    reader UI, so nothing that currently works breaks.

The surface is intentionally small: sources_active(), known_dedupe_hashes(),
insert_document(), upsert_analysis(). The worker orchestrates them.
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from supabase import Client, create_client


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def get_client() -> Client:
    """Return a cached service-role Supabase client.

    Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment.
    The service-role key bypasses RLS — only ever used server-side in the
    worker, never shipped to the frontend. Raises if either env var is
    missing, so misconfiguration fails loudly at the top of a run instead
    of silently later.
    """
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the "
            "environment. The worker cannot run without them."
        )
    return create_client(url, key)


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------

def sources_active() -> list[dict[str, Any]]:
    """Return every active source, ordered by priority then slug.

    Priority here is the text column from the CSV ('Tier 1' | 'Tier 2' |
    'Tier 3'), which sorts lexicographically into the right order for us.
    """
    sb = get_client()
    res = (
        sb.table("depth_sources")
        .select("*")
        .eq("active", True)
        .order("priority")
        .order("slug")
        .execute()
    )
    return res.data or []


def upsert_source(source_row: dict[str, Any]) -> None:
    """Upsert a single source by slug (used by the loader on startup).

    The loader reads `context_engine_sources_master.csv` and sends each row
    through here. Using slug as the conflict key means editing a row in the
    CSV updates the Supabase row in place instead of creating a duplicate.
    """
    sb = get_client()
    sb.table("depth_sources").upsert(source_row, on_conflict="slug").execute()


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

def known_dedupe_hashes() -> set[str]:
    """Return every dedupe_hash currently in depth_documents.

    Loaded once at the start of each worker run and held in memory. The
    ingestion loop checks candidates against this set before hitting the
    DB, so the common case is a Python set membership test, not a round
    trip. At 50k documents the set is ~3MB — still fine.

    (Once the corpus grows past ~500k, switch to a bloom filter or a
    server-side ON CONFLICT DO NOTHING insert. Not a v1 concern.)
    """
    sb = get_client()
    # Supabase caps rows per request at 1000 by default — paginate.
    hashes: set[str] = set()
    page_size = 1000
    offset = 0
    while True:
        res = (
            sb.table("depth_documents")
            .select("dedupe_hash")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = res.data or []
        for row in rows:
            hashes.add(row["dedupe_hash"])
        if len(rows) < page_size:
            break
        offset += page_size
    return hashes


# Client-side id assignment. The initial Supabase migration declared
# depth_documents.id as a plain bigint primary key (not identity), so
# inserts without an explicit id hit a NOT NULL violation. Rather than
# require the user to run a schema fix before the worker can run, we
# assign ids client-side: at worker start-up, fetch max(id) once and
# increment per insert. Single worker, single thread, so no race.
_NEXT_ID_CACHE: dict[str, int] = {}


def _next_id(table: str) -> int:
    """Return the next unused id for a Supabase table, cached per run.

    Fetches max(id) once, then increments in memory. Cheap because the
    worker only inserts a few dozen rows per run. If the worker ever
    goes multi-threaded or multi-process, replace with a SELECT + INSERT
    in a single transaction or run the identity schema fix.
    """
    if table in _NEXT_ID_CACHE:
        _NEXT_ID_CACHE[table] += 1
        return _NEXT_ID_CACHE[table]
    sb = get_client()
    res = (
        sb.table(table)
        .select("id")
        .order("id", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    start = (rows[0]["id"] if rows else 0) + 1
    _NEXT_ID_CACHE[table] = start
    return start


def insert_document(doc_row: dict[str, Any]) -> int | None:
    """Insert one depth_documents row, return the new id (None on conflict).

    Assigns id client-side (see _next_id). Relies on the
    `depth_documents_dedupe_hash_key` unique constraint to drop
    duplicates. If another worker already inserted the same doc between
    our in-memory cache build and this insert, on_conflict do-nothing
    will return zero rows and we return None.
    """
    sb = get_client()
    if "id" not in doc_row or doc_row["id"] is None:
        doc_row = {**doc_row, "id": _next_id("depth_documents")}
    try:
        res = (
            sb.table("depth_documents")
            .upsert(doc_row, on_conflict="dedupe_hash", ignore_duplicates=True)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return None
        return rows[0]["id"]
    except Exception as e:
        # Supabase-py can raise on unique violations even with ignore_duplicates
        # in some versions — swallow those and return None, re-raise everything
        # else so the worker surface can log and skip.
        if "duplicate key" in str(e).lower() or "23505" in str(e):
            return None
        raise


def pending_documents(limit: int = 50) -> list[dict[str, Any]]:
    """Return up to `limit` documents with analysis_status='pending'.

    Ordered by published_at desc so the newest stuff gets analyzed first
    — important for a worker that may hit a time budget before draining
    the full backlog. Includes the body column because the analyzer
    needs it.
    """
    sb = get_client()
    res = (
        sb.table("depth_documents")
        .select("*, depth_sources(category,priority,name,slug)")
        .eq("analysis_status", "pending")
        .order("published_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def mark_document_status(doc_id: int, status: str) -> None:
    """Flip analysis_status — used after analysis succeeds or fails."""
    sb = get_client()
    sb.table("depth_documents").update({"analysis_status": status}).eq(
        "id", doc_id
    ).execute()


# ---------------------------------------------------------------------------
# Analyses
# ---------------------------------------------------------------------------

def upsert_analysis(analysis_row: dict[str, Any]) -> None:
    """Upsert a depth_analyses row keyed on document_id.

    `document_id` is the primary key, so the upsert replaces the row if
    an earlier analysis run produced one. That means re-running Claude
    on a document with an improved prompt just overwrites the prior
    result instead of leaving an orphan.

    Silently skips FK violations (doc deleted mid-run) instead of
    crashing the whole analyze pass.
    """
    sb = get_client()
    try:
        sb.table("depth_analyses").upsert(
            analysis_row, on_conflict="document_id"
        ).execute()
    except Exception as e:
        if "23503" in str(e) or "foreign key" in str(e).lower():
            return  # doc was deleted mid-run — skip silently
        raise
