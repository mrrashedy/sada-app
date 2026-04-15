"""Re-poll a curated list of analytical sources to validate the
new full-article fetch + quality gate. Prints body-length stats
per source so we can see which ones now produce real decomposable
text.

Usage:  uv run python -m scripts.repoll_analytical
"""
from __future__ import annotations

from sqlalchemy import func

from app.db import SessionLocal
from app.ingest.pipeline import ingest_source
from app.models.document import Document
from app.models.source import Source

# Curated test set — a mix of RSS-teaser sources (FP/FA/PS/AC) that
# should benefit most from the full-article fetch, and a few anchors
# that already worked, to make sure nothing regressed.
TARGET_SLUGS = [
    "foreign-policy",
    "foreign-affairs",
    "project-syndicate",
    "atlantic-council",
    "brookings-institution",
    "carnegie-endowment-for-international-peace",
    "carnegie-middle-east-center",
    "chatham-house",
    "international-crisis-group",
    "arab-barometer",
    # Arabic anchors
    "al-zaytouna-centre-for-studies-and-consultations",
    "egyptian-center-for-thought-and-strategic-studies",
    "center-for-arab-unity-studies",
]


def _body_stats(db, source_id: int) -> tuple[int, int, int]:
    """Return (count, avg_len, max_len) for a source's non-null bodies."""
    rows = (
        db.query(
            func.count(Document.id),
            func.avg(func.length(Document.body)),
            func.max(func.length(Document.body)),
        )
        .filter(Document.source_id == source_id, Document.body.isnot(None))
        .one()
    )
    n, avg, mx = rows
    return int(n or 0), int(avg or 0), int(mx or 0)


def main() -> None:
    print("== repoll_analytical ==")
    with SessionLocal() as db:
        srcs = (
            db.query(Source).filter(Source.slug.in_(TARGET_SLUGS)).all()
        )
        slug_to_id = {s.slug: s.id for s in srcs}

    missing = [s for s in TARGET_SLUGS if s not in slug_to_id]
    if missing:
        print(f"  missing slugs (skipped): {missing}")

    header = f"{'slug':45} {'found':>6} {'new':>4} {'docs':>5} {'avg_body':>9} {'max_body':>9}"
    print(header)
    print("-" * len(header))

    for slug in TARGET_SLUGS:
        sid = slug_to_id.get(slug)
        if sid is None:
            continue
        # Fresh session per source so one failure doesn't poison the rest.
        with SessionLocal() as db:
            result = ingest_source(db, sid, max_new=10)
        with SessionLocal() as db:
            n, avg, mx = _body_stats(db, sid)
        found = result.get("found", "-")
        new = result.get("new", "-")
        ok = result.get("ok", False)
        marker = "" if ok else " [ERROR: " + str(result.get("error", ""))[:60] + "]"
        print(f"{slug:45} {found!s:>6} {new!s:>4} {n:>5} {avg:>9} {mx:>9}{marker}")

    # Grand totals
    with SessionLocal() as db:
        total = db.query(Document).count()
        ar = db.query(Document).filter(Document.language == "ar").count()
        pending = db.query(Document).filter(Document.analysis_status == "pending").count()
    print("-" * len(header))
    print(f"  total docs: {total}  arabic: {ar}  pending-analysis: {pending}")


if __name__ == "__main__":
    main()
