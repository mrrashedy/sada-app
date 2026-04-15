"""Analysis pipeline — orchestrates Claude + Voyage for one document at a time.

Usage:
    from app.analyze.pipeline import analyze_document
    analyze_document(db, document_id)

Typical flow:
    1. Load document + source.
    2. Skip if source.priority is not in settings.analyze_tiers.
    3. Choose prompt variant from source.category.
    4. Build the prompt, call Claude (system = editorial constitution).
    5. Parse JSON → Analysis row.
    6. Build a "title + thesis + en_summary" string and call Voyage.
    7. Insert the embedding into the sqlite-vec virtual table.
    8. Mark document analysis_status = 'done'.
    9. On error: mark 'failed' with the exception message in raw_metadata_json.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from app.analyze import claude, embeddings
from app.analyze.prompts import (
    EDITORIAL_CONSTITUTION,
    PROMPT_VERSION,
    build_prompt,
    variant_for_category,
)
from app.config import settings
from app.models.analysis import Analysis
from app.models.document import Document

logger = logging.getLogger(__name__)


def _truncate_body(body: str | None, max_tokens: int) -> str:
    """Rough token-safe truncation. Claude counts ~4 chars/token on average."""
    if not body:
        return ""
    max_chars = max_tokens * 4
    if len(body) <= max_chars:
        return body
    return body[:max_chars] + "\n\n[... truncated for analysis window ...]"


def _as_list(value: Any) -> list | None:
    if value is None:
        return None
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        # Accept single-string for robustness.
        return [value]
    return None


def _extract_core(data: dict) -> dict:
    """Pull the core schema fields out of Claude's response.

    Handles v2 prompt output (analytical_conclusion + core_argument +
    assumptions + analytical_frame + tensions + if_correct_then) and falls
    back to v1 field names (thesis + key_points) when present, so old
    analyses remain decodable if we ever replay them."""
    core_argument = data.get("core_argument") or data.get("thesis")
    return {
        # New v2 fields — the main analytical surface.
        "analytical_conclusion": data.get("analytical_conclusion"),
        "core_argument": core_argument,
        "supporting_logic": data.get("supporting_logic"),
        "assumptions_json": _as_list(data.get("assumptions")),
        "analytical_frame": data.get("analytical_frame"),
        "tensions": data.get("tensions"),
        "if_correct_then": data.get("if_correct_then"),
        # Legacy compat — thesis column mirrors core_argument so old UI
        # templates continue to work.
        "thesis": core_argument,
        "key_points_json": _as_list(data.get("key_points")),
        "evidence_type": data.get("evidence_type"),
        "methodology": data.get("methodology") or data.get("supporting_logic"),
        "frameworks_json": _as_list(data.get("frameworks")),
        "regions_json": _as_list(data.get("regions")),
        "topics_json": _as_list(data.get("topics")),
        "actors_json": _as_list(data.get("actors")),
        "counterarguments": data.get("counterarguments"),
        "limitations": data.get("limitations"),
        "implications": data.get("implications") or data.get("if_correct_then"),
        "ar_summary": data.get("ar_summary"),
        "en_summary": data.get("en_summary"),
        "key_quotes_json": data.get("key_quotes") if isinstance(
            data.get("key_quotes"), list
        ) else None,
    }


def _extract_extras(data: dict, variant: str) -> dict | None:
    """Pull the variant-specific extras. First honors an `extras` key if
    present; otherwise collects any fields outside the core schema."""
    if isinstance(data.get("extras"), dict):
        return data["extras"] or None

    core_keys = {
        # v2
        "analytical_conclusion",
        "core_argument",
        "supporting_logic",
        "assumptions",
        "analytical_frame",
        "tensions",
        "if_correct_then",
        # v1 / shared
        "thesis",
        "key_points",
        "evidence_type",
        "methodology",
        "frameworks",
        "regions",
        "topics",
        "actors",
        "counterarguments",
        "limitations",
        "implications",
        "ar_summary",
        "en_summary",
        "key_quotes",
    }
    extras = {k: v for k, v in data.items() if k not in core_keys}
    return extras or None


def analyze_document(db: Session, document_id: int, *, force: bool = False) -> Analysis | None:
    """Run Claude + Voyage on a single document. Commits on success.

    Returns the created Analysis row, or None if skipped (e.g., tier filter).
    """
    doc = (
        db.query(Document)
        .options(joinedload(Document.source))
        .filter_by(id=document_id)
        .one_or_none()
    )
    if doc is None:
        raise ValueError(f"document not found: {document_id}")

    if not force and doc.analysis_status == "done":
        logger.info("document %d already analyzed, skipping", doc.id)
        return doc.analysis

    src = doc.source
    if not force and src.priority not in settings.analyze_tiers:
        logger.info(
            "document %d skipped (tier %s not in analyze_tiers=%s)",
            doc.id,
            src.priority,
            settings.analyze_tiers,
        )
        doc.analysis_status = "skipped"
        db.commit()
        return None

    variant = variant_for_category(src.category)

    body = _truncate_body(doc.body or doc.abstract, settings.max_body_tokens)
    if not body.strip():
        logger.warning("document %d has empty body, marking failed", doc.id)
        doc.analysis_status = "failed"
        doc.raw_metadata_json = (doc.raw_metadata_json or {}) | {
            "analysis_error": "empty body"
        }
        db.commit()
        return None

    prompt = build_prompt(
        variant=variant,
        title=doc.title,
        authors=", ".join(doc.authors_json or []),
        source_name=src.name,
        category=src.category,
        published_at=doc.published_at.isoformat() if doc.published_at else "",
        language=doc.language or "",
        body=body,
    )

    doc.analysis_status = "analyzing"
    db.commit()

    try:
        result = claude.analyze(
            system=EDITORIAL_CONSTITUTION,
            user_prompt=prompt,
            max_tokens=4000,
            temperature=0.2,
        )
    except Exception as e:
        logger.exception("claude call failed for document %d: %s", doc.id, e)
        doc.analysis_status = "failed"
        doc.raw_metadata_json = (doc.raw_metadata_json or {}) | {
            "analysis_error": str(e)[:500]
        }
        db.commit()
        raise

    core = _extract_core(result.data)
    extras = _extract_extras(result.data, variant)

    # Upsert the analysis row (delete-then-insert pattern for idempotency).
    db.query(Analysis).filter_by(document_id=doc.id).delete()
    db.flush()

    analysis = Analysis(
        document_id=doc.id,
        prompt_variant=variant,
        extras_json=extras,
        model=result.model,
        prompt_version=PROMPT_VERSION,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        created_at=datetime.utcnow(),
        **core,
    )
    db.add(analysis)
    doc.analysis_status = "done"
    db.flush()

    # Generate the embedding from the most informative compact representation.
    embed_text_input = "\n\n".join(
        part
        for part in (
            doc.title,
            core.get("thesis") or "",
            core.get("en_summary") or "",
        )
        if part
    )
    try:
        vec = embeddings.embed_text(embed_text_input)
        blob = embeddings.vector_to_blob(vec)
        # sqlite-vec virtual table: upsert via delete+insert
        db.execute(
            text("DELETE FROM document_embeddings WHERE document_id = :id"),
            {"id": doc.id},
        )
        db.execute(
            text(
                "INSERT INTO document_embeddings(document_id, embedding) "
                "VALUES (:id, :emb)"
            ),
            {"id": doc.id, "emb": blob},
        )
    except Exception as e:
        # Embedding failure is non-fatal — the analysis itself is useful without it.
        logger.warning("embedding failed for document %d: %s", doc.id, e)

    db.commit()
    logger.info(
        "analyzed document %d [%s] (in=%d out=%d)",
        doc.id,
        variant,
        result.input_tokens,
        result.output_tokens,
    )
    return analysis
