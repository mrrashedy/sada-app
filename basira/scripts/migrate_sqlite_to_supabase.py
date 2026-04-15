"""One-shot migration: copy every row from the local SQLite database
into Supabase.

Reads from basira/data/basira.db (via raw sqlite3, no SQLAlchemy) and
writes to the `depth_sources`, `depth_documents`, and `depth_analyses`
tables via the supabase-py service-role client. Idempotent: re-running
it upserts on slug / dedupe_hash / document_id so you can run it twice
without duplicating.

Usage (from basira/):
    uv run python -m scripts.migrate_sqlite_to_supabase
    uv run python -m scripts.migrate_sqlite_to_supabase --dry-run
    uv run python -m scripts.migrate_sqlite_to_supabase --limit 10

Requires:
    SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in basira/.env

Prints a summary of rows copied for each table. Expects the Supabase
schema to already exist (run supabase/migrations/20260416_depth.sql
in the Supabase SQL editor first).
"""
from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("migrate")


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "data" / "basira.db"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


def _parse_json(value: Any) -> Any:
    """SQLite stores JSON columns as text. Decode to Python, pass through None."""
    if value is None or value == "":
        return None
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return None


def _iso(value: Any) -> str | None:
    """Normalize SQLite datetime strings to ISO-8601 with UTC tz."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        # SQLite stores as 'YYYY-MM-DD HH:MM:SS' or similar.
        try:
            dt = datetime.fromisoformat(str(value).replace(" ", "T"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# ---------------------------------------------------------------------------
# Copy functions
# ---------------------------------------------------------------------------

def copy_sources(conn: sqlite3.Connection, sb, *, dry_run: bool, limit: int | None) -> int:
    cur = conn.execute("SELECT * FROM sources")
    rows = cur.fetchall()
    if limit:
        rows = rows[:limit]
    logger.info("sources: %d rows to copy", len(rows))
    if dry_run:
        return len(rows)

    batch: list[dict[str, Any]] = []
    for row in rows:
        d = _row_to_dict(row)
        batch.append(
            {
                "id": d["id"],
                "slug": d["slug"],
                "name": d["name"],
                "category": d["category"],
                "region": d["region"],
                "language": d["language"],
                "priority": d["priority"],
                "url": d["url"],
                "scrape_strategy": d["scrape_strategy"],
                "feeds_json": _parse_json(d.get("feeds_json")),
                "list_selector": d.get("list_selector"),
                "link_selector": d.get("link_selector"),
                "custom_scraper": d.get("custom_scraper"),
                "polling_cadence": d.get("polling_cadence"),
                "min_poll_interval_seconds": d.get("min_poll_interval_seconds") or 300,
                "last_polled_at": _iso(d.get("last_polled_at")),
                "last_seen_at": _iso(d.get("last_seen_at")),
                "active": bool(d.get("active", 1)),
                "created_at": _iso(d.get("created_at")) or datetime.utcnow().isoformat(),
            }
        )
    # Batch in chunks of 200.
    inserted = 0
    for i in range(0, len(batch), 200):
        chunk = batch[i : i + 200]
        sb.table("depth_sources").upsert(chunk, on_conflict="slug").execute()
        inserted += len(chunk)
        logger.info("  sources: %d / %d", inserted, len(batch))
    return inserted


def copy_documents(conn: sqlite3.Connection, sb, *, dry_run: bool, limit: int | None) -> int:
    cur = conn.execute("SELECT * FROM documents ORDER BY id")
    rows = cur.fetchall()
    if limit:
        rows = rows[:limit]
    logger.info("documents: %d rows to copy", len(rows))
    if dry_run:
        return len(rows)

    batch: list[dict[str, Any]] = []
    for row in rows:
        d = _row_to_dict(row)
        batch.append(
            {
                "id": d["id"],
                "source_id": d["source_id"],
                "canonical_url": d["canonical_url"],
                "dedupe_hash": d["dedupe_hash"],
                "document_type": d["document_type"],
                "title": d["title"],
                "title_ar": d.get("title_ar"),
                "authors_json": _parse_json(d.get("authors_json")),
                "abstract": d.get("abstract"),
                "body": d.get("body"),
                "language": d.get("language"),
                "published_at": _iso(d.get("published_at")),
                "fetched_at": _iso(d.get("fetched_at")) or datetime.utcnow().isoformat(),
                "pdf_path": d.get("pdf_path"),
                "html_path": d.get("html_path"),
                "analysis_status": d.get("analysis_status", "pending"),
                "raw_metadata_json": _parse_json(d.get("raw_metadata_json")),
                "created_at": _iso(d.get("created_at")) or datetime.utcnow().isoformat(),
            }
        )

    inserted = 0
    for i in range(0, len(batch), 100):
        chunk = batch[i : i + 100]
        sb.table("depth_documents").upsert(chunk, on_conflict="dedupe_hash").execute()
        inserted += len(chunk)
        logger.info("  documents: %d / %d", inserted, len(batch))
    return inserted


def copy_analyses(conn: sqlite3.Connection, sb, *, dry_run: bool, limit: int | None) -> int:
    cur = conn.execute("SELECT * FROM analyses")
    rows = cur.fetchall()
    if limit:
        rows = rows[:limit]
    logger.info("analyses: %d rows to copy", len(rows))
    if dry_run:
        return len(rows)

    batch: list[dict[str, Any]] = []
    for row in rows:
        d = _row_to_dict(row)
        batch.append(
            {
                "document_id": d["document_id"],
                "prompt_variant": d.get("prompt_variant") or "legacy",
                "analytical_conclusion": d.get("analytical_conclusion"),
                "core_argument": d.get("core_argument"),
                "supporting_logic": d.get("supporting_logic"),
                "assumptions_json": _parse_json(d.get("assumptions_json")),
                "analytical_frame": d.get("analytical_frame"),
                "tensions": d.get("tensions"),
                "if_correct_then": d.get("if_correct_then"),
                "thesis": d.get("thesis"),
                "key_points_json": _parse_json(d.get("key_points_json")),
                "evidence_type": d.get("evidence_type"),
                "methodology": d.get("methodology"),
                "frameworks_json": _parse_json(d.get("frameworks_json")),
                "regions_json": _parse_json(d.get("regions_json")),
                "topics_json": _parse_json(d.get("topics_json")),
                "actors_json": _parse_json(d.get("actors_json")),
                "counterarguments": d.get("counterarguments"),
                "limitations": d.get("limitations"),
                "implications": d.get("implications"),
                "ar_summary": d.get("ar_summary"),
                "en_summary": d.get("en_summary"),
                "key_quotes_json": _parse_json(d.get("key_quotes_json")),
                "extras_json": _parse_json(d.get("extras_json")),
                "model": d.get("model") or "unknown",
                "prompt_version": d.get("prompt_version") or "legacy",
                "input_tokens": d.get("input_tokens"),
                "output_tokens": d.get("output_tokens"),
                "created_at": _iso(d.get("created_at")) or datetime.utcnow().isoformat(),
            }
        )

    inserted = 0
    for i in range(0, len(batch), 100):
        chunk = batch[i : i + 100]
        sb.table("depth_analyses").upsert(chunk, on_conflict="document_id").execute()
        inserted += len(chunk)
        logger.info("  analyses: %d / %d", inserted, len(batch))
    return inserted


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None, help="cap per table, for testing")
    parser.add_argument("--sources-only", action="store_true")
    parser.add_argument("--documents-only", action="store_true")
    parser.add_argument("--analyses-only", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")

    if not DB_PATH.exists():
        print(f"FATAL: {DB_PATH} does not exist", file=sys.stderr)
        return 1

    # Load .env from project root so SUPABASE_* vars are picked up.
    try:
        from dotenv import load_dotenv
        load_dotenv(PROJECT_ROOT / ".env")
    except ImportError:
        pass

    from app import supabase_store as store
    sb = store.get_client()

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    summary = {}
    do_all = not (args.sources_only or args.documents_only or args.analyses_only)

    if do_all or args.sources_only:
        summary["sources"] = copy_sources(conn, sb, dry_run=args.dry_run, limit=args.limit)
    if do_all or args.documents_only:
        summary["documents"] = copy_documents(conn, sb, dry_run=args.dry_run, limit=args.limit)
    if do_all or args.analyses_only:
        summary["analyses"] = copy_analyses(conn, sb, dry_run=args.dry_run, limit=args.limit)

    conn.close()
    print("\n=== MIGRATION SUMMARY ===")
    for k, v in summary.items():
        print(f"  {k:12s}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
