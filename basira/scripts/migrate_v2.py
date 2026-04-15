"""One-shot migration:
1. Drop and recreate the `analyses` table with v2 columns (safe: 0 rows).
2. Purge The New Arab (source_id=269) documents, embeddings, ingest_runs, source row.
3. Reload sources from the (trimmed) CSV so slugs reconcile with current config.
4. Print a short report.

Run with:  uv run python -m scripts.migrate_v2
"""
from __future__ import annotations

from sqlalchemy import text

from app.db import Base, SessionLocal, engine
from app.ingest.loader import load_sources
from app.models.analysis import Analysis  # noqa: F401  — register mapper
from app.models.document import Document
from app.models.ingest_run import IngestRun
from app.models.source import Source


def main() -> None:
    print("== migrate_v2 ==")

    # --- Step 1: recreate analyses table ---------------------------------------
    with engine.begin() as conn:
        n_rows = conn.execute(text("SELECT COUNT(*) FROM analyses")).scalar_one()
        if n_rows > 0:
            raise SystemExit(
                f"analyses has {n_rows} rows — not safe to drop. "
                "Write an ALTER TABLE migration instead."
            )
        print("  dropping analyses table (0 rows)")
        conn.execute(text("DROP TABLE IF EXISTS analyses"))
    Analysis.__table__.create(engine)
    print("  analyses table recreated with v2 columns")

    # --- Step 2: purge The New Arab --------------------------------------------
    with SessionLocal() as db:
        src = (
            db.query(Source)
            .filter(Source.slug.like("%new-arab%"))
            .one_or_none()
        )
        if src is None:
            print("  the-new-arab source not found (already purged?)")
        else:
            doc_ids = [
                row[0]
                for row in db.query(Document.id).filter_by(source_id=src.id).all()
            ]
            print(f"  purging source={src.slug} (id={src.id}) with {len(doc_ids)} docs")

            if doc_ids:
                # sqlite-vec virtual table — delete embeddings first
                db.execute(
                    text("DELETE FROM document_embeddings WHERE document_id IN :ids").bindparams(
                        __import__("sqlalchemy").bindparam("ids", expanding=True)
                    ),
                    {"ids": doc_ids},
                )
            # Documents (cascade should clean analyses, but analyses is already empty).
            db.query(Document).filter_by(source_id=src.id).delete(synchronize_session=False)
            db.query(IngestRun).filter_by(source_id=src.id).delete(synchronize_session=False)
            db.delete(src)
            db.commit()
            print("  the-new-arab purged")

    # --- Step 3: reconcile sources from CSV ------------------------------------
    with SessionLocal() as db:
        n_before = db.query(Source).count()
        summary = load_sources(db)
        n_after = db.query(Source).count()
        print(f"  sources: {n_before} → {n_after}  (load_sources: {summary})")

    # --- Step 4: report ---------------------------------------------------------
    with SessionLocal() as db:
        n_docs = db.query(Document).count()
        n_sources = db.query(Source).count()
        n_analyses = db.execute(text("SELECT COUNT(*) FROM analyses")).scalar_one()
        n_ar = db.query(Document).filter(Document.language == "ar").count()
    print("== done ==")
    print(f"  documents: {n_docs}  ({n_ar} Arabic)")
    print(f"  sources:   {n_sources}")
    print(f"  analyses:  {n_analyses}")


if __name__ == "__main__":
    main()
