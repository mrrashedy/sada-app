"""One-shot cleanup for duplicate documents created by scripts/repoll_analytical.py.

The re-poll fetched the full article body for each URL and inserted new rows with
a new dedupe_hash, leaving the old RSS-teaser rows behind. Result: two rows per
article — one with a ~300-char abstract, one with the real 3k–30k body.

This script groups documents by (source_id, normalized title), keeps the row
with the longest body in each group, and deletes the rest — including any
matching rows in document_embeddings, analyses, and document_topics.

Safety guard: groups whose rows point to more than one canonical_url are NOT
repoll duplicates (they're distinct articles sharing a generic page title like
"Media Center" on mofa.gov.qa). Those groups are skipped and listed in the
output so you can eyeball them.

Usage:
    uv run python -m scripts.dedupe_repolled               # dry-run (default)
    uv run python -m scripts.dedupe_repolled --no-dry-run  # actually delete
"""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

import sqlite_vec

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "basira.db"


def _connect(path: Path) -> sqlite3.Connection:
    """Open the DB with sqlite-vec loaded so we can touch document_embeddings.

    isolation_level=None puts us in autocommit mode so we can drive BEGIN
    IMMEDIATE / COMMIT / ROLLBACK explicitly without fighting Python's implicit
    transaction state machine. busy_timeout lets us wait out the running
    engine's short write locks instead of failing instantly.
    """
    conn = sqlite3.connect(path, isolation_level=None)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def _counts(conn: sqlite3.Connection) -> dict[str, int]:
    return {
        "documents": conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0],
        "document_embeddings": conn.execute(
            "SELECT COUNT(*) FROM document_embeddings"
        ).fetchone()[0],
        "analyses": conn.execute("SELECT COUNT(*) FROM analyses").fetchone()[0],
        "document_topics": conn.execute(
            "SELECT COUNT(*) FROM document_topics"
        ).fetchone()[0],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Only report what would be deleted (default). Pass --no-dry-run to execute.",
    )
    args = parser.parse_args()
    dry_run: bool = args.dry_run

    mode = "DRY-RUN" if dry_run else "APPLY"
    print(f"== dedupe_repolled [{mode}] ==")
    print(f"   db: {DB_PATH}")

    conn = _connect(DB_PATH)

    before = _counts(conn)
    print("\nBefore:")
    for k, v in before.items():
        print(f"  {k:25} {v}")

    # Pull all docs so we can group in Python — small table (<1k rows).
    # Ordering puts the winner (longest body, newest id) first within each group.
    rows = conn.execute(
        """
        SELECT
            id,
            source_id,
            canonical_url,
            lower(trim(title)) AS norm_title,
            COALESCE(length(body), 0) AS body_len
        FROM documents
        ORDER BY source_id, norm_title, body_len DESC, id DESC
        """
    ).fetchall()

    groups: dict[tuple[int, str], list[tuple[int, str, int]]] = {}
    for doc_id, source_id, canonical_url, norm_title, body_len in rows:
        groups.setdefault((source_id, norm_title), []).append(
            (doc_id, canonical_url, body_len)
        )

    to_delete: list[int] = []
    kept: list[tuple[int, int, int]] = []  # (kept_id, source_id, body_len)
    # (source_id, title, member_count, distinct_url_count)
    skipped_groups: list[tuple[int, str, int, int]] = []

    dup_group_count = 0
    for (source_id, norm_title), members in groups.items():
        if len(members) < 2:
            continue
        dup_group_count += 1

        # Safety guard: only dedupe within a group if all rows share one URL.
        urls = {m[1] for m in members}
        if len(urls) > 1:
            skipped_groups.append((source_id, norm_title, len(members), len(urls)))
            continue

        # Ordered by body_len DESC, id DESC — first is winner.
        winner = members[0]
        losers = members[1:]
        kept.append((winner[0], source_id, winner[2]))
        to_delete.extend(m[0] for m in losers)

    print(f"\nDuplicate title groups found: {dup_group_count}")
    print(
        f"Groups skipped (distinct canonical_urls — likely title collisions): "
        f"{len(skipped_groups)}"
    )
    for source_id, title, n, n_urls in skipped_groups:
        print(f"  skip  src={source_id:4}  n={n}  urls={n_urls}  title={title!r}")

    print(f"\nGroups to dedupe:   {len(kept)}")
    print(f"Documents to delete: {len(to_delete)}")

    if to_delete:
        placeholders = ",".join("?" * len(to_delete))
        detail = conn.execute(
            f"""
            SELECT id, source_id, COALESCE(length(body), 0), substr(title, 1, 60)
            FROM documents
            WHERE id IN ({placeholders})
            ORDER BY source_id, id
            """,
            to_delete,
        ).fetchall()
        print("\nDeleting (losers):")
        for doc_id, source_id, body_len, title in detail:
            print(f"  id={doc_id:4}  src={source_id:4}  body={body_len:6}  | {title}")

        kept_ids = [k[0] for k in kept]
        kept_placeholders = ",".join("?" * len(kept_ids))
        kept_detail = conn.execute(
            f"""
            SELECT id, source_id, COALESCE(length(body), 0), substr(title, 1, 60)
            FROM documents
            WHERE id IN ({kept_placeholders})
            ORDER BY source_id, id
            """,
            kept_ids,
        ).fetchall()
        print("\nKeeping (winners):")
        for doc_id, source_id, body_len, title in kept_detail:
            print(f"  id={doc_id:4}  src={source_id:4}  body={body_len:6}  | {title}")

    if dry_run:
        print("\n(dry-run — no changes made. Re-run with --no-dry-run to execute.)")
        conn.close()
        return

    if not to_delete:
        print("\nNothing to delete.")
        conn.close()
        return

    # Apply in a single transaction. BEGIN IMMEDIATE grabs the write lock
    # up front so we fail fast (well, after busy_timeout) rather than halfway
    # through the deletes. If anything raises, roll back and leave the DB
    # untouched.
    placeholders = ",".join("?" * len(to_delete))
    conn.execute("BEGIN IMMEDIATE")
    try:
        # document_embeddings is a vec0 virtual table — no FK cascade, must be
        # deleted explicitly.
        conn.execute(
            f"DELETE FROM document_embeddings WHERE document_id IN ({placeholders})",
            to_delete,
        )
        # analyses and document_topics have ON DELETE CASCADE, but delete
        # explicitly so we don't depend on PRAGMA foreign_keys being on.
        conn.execute(
            f"DELETE FROM analyses WHERE document_id IN ({placeholders})",
            to_delete,
        )
        conn.execute(
            f"DELETE FROM document_topics WHERE document_id IN ({placeholders})",
            to_delete,
        )
        conn.execute(
            f"DELETE FROM documents WHERE id IN ({placeholders})",
            to_delete,
        )
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise

    after = _counts(conn)
    print("\nAfter:")
    for k, v in after.items():
        print(f"  {k:25} {v}   (delta {v - before[k]:+d})")

    conn.close()
    print(f"\nDone. Removed {len(to_delete)} duplicate document(s).")


if __name__ == "__main__":
    main()
