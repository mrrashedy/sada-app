"""/api/topics — list topics and documents per topic.

v0: topics are inferred from analyses' topics_json arrays rather than
maintained as a strict taxonomy table. A proper Topic row is promoted
whenever it appears in 3+ analyses. This keeps the taxonomy organic in
the early days without forcing premature categorization.
"""
from __future__ import annotations

from collections import Counter

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.analysis import Analysis

router = APIRouter()


@router.get("")
def list_topics(
    min_count: int = Query(3, ge=1),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> dict:
    """Return all topics that appear in at least `min_count` analyses."""
    counter: Counter[str] = Counter()
    rows = db.query(Analysis.topics_json).filter(Analysis.topics_json.isnot(None)).all()
    for (topics,) in rows:
        if not topics:
            continue
        for t in topics:
            if isinstance(t, str) and t.strip():
                counter[t.strip()] += 1
    items = [
        {"topic": t, "count": c}
        for t, c in counter.most_common(limit)
        if c >= min_count
    ]
    return {"ok": True, "total": len(items), "topics": items}
