"""Voyage AI embedding client.

Generates 1024-dim vectors via `voyage-3`. Used for semantic search and
`/documents/{id}/related` queries.
"""
from __future__ import annotations

import logging
import struct

import voyageai

from app.config import settings

logger = logging.getLogger(__name__)

_client: voyageai.Client | None = None


def _get_client() -> voyageai.Client:
    global _client
    if _client is None:
        if not settings.voyage_api_key:
            raise RuntimeError(
                "VOYAGE_API_KEY is not set. Add it to .env before using the embedding pipeline."
            )
        _client = voyageai.Client(api_key=settings.voyage_api_key)
    return _client


def embed_text(text: str, input_type: str = "document") -> list[float]:
    """Return a 1024-dim embedding vector for the given text."""
    client = _get_client()
    result = client.embed(
        texts=[text],
        model=settings.voyage_model,
        input_type=input_type,
        truncation=True,
    )
    vecs = result.embeddings
    if not vecs:
        raise RuntimeError("voyage returned no embeddings")
    return vecs[0]


def embed_batch(texts: list[str], input_type: str = "document") -> list[list[float]]:
    """Return embeddings for a batch of texts (up to ~128 per call)."""
    client = _get_client()
    result = client.embed(
        texts=texts,
        model=settings.voyage_model,
        input_type=input_type,
        truncation=True,
    )
    return result.embeddings


def vector_to_blob(vec: list[float]) -> bytes:
    """Pack a float32 vector for sqlite-vec insertion."""
    return struct.pack(f"{len(vec)}f", *vec)
