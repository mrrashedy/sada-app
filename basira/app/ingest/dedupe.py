"""Deduplication helpers.

Dedupe hash = sha256(canonical_url + normalized_title + first 500 chars of body).
Lets the same paper picked up by two sources land in the DB once.
"""
from __future__ import annotations

import hashlib
import re
from urllib.parse import urlparse, urlunparse


def canonicalize_url(url: str) -> str:
    """Strip tracking params, normalize casing, drop fragments."""
    if not url:
        return ""
    parsed = urlparse(url.strip())
    # Drop query params that are pure tracking
    query = parsed.query or ""
    if query:
        keep = []
        for part in query.split("&"):
            key = part.split("=", 1)[0].lower()
            if key in {
                "utm_source",
                "utm_medium",
                "utm_campaign",
                "utm_content",
                "utm_term",
                "fbclid",
                "gclid",
                "mc_cid",
                "mc_eid",
                "_hsenc",
                "_hsmi",
            }:
                continue
            keep.append(part)
        query = "&".join(keep)
    return urlunparse(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower().replace("www.", ""),
            parsed.path.rstrip("/") or "/",
            "",
            query,
            "",
        )
    )


def normalize_title(title: str) -> str:
    """Lowercase, collapse whitespace, strip punctuation for dedup."""
    if not title:
        return ""
    t = title.strip().lower()
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"[^\w\s\u0600-\u06ff]", "", t)  # keep Arabic range
    return t.strip()


def make_dedupe_hash(url: str, title: str, body: str | None = None) -> str:
    """Compute the content hash used for cross-source dedup."""
    body_prefix = (body or "")[:500]
    material = f"{canonicalize_url(url)}\n{normalize_title(title)}\n{body_prefix}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()
