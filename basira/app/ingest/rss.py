"""RSS / Atom ingestion.

Uses feedparser to pull entries from one or more feed URLs for a source.
Each entry becomes a `CandidateDocument` — not yet persisted. The pipeline
orchestrator persists it after dedup + analysis_status bootstrapping.

Critical behavior: when the RSS entry's body is too short for analytical
decomposition (common for Foreign Affairs, Foreign Policy, Project Syndicate,
Atlantic Council — they publish headlines + teaser, not full text), we follow
the canonical link and run trafilatura to pull the full article body. Without
this step, Claude would be decomposing headlines, not arguments.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from time import mktime

import feedparser
import httpx
import trafilatura

from app.models.source import Source

logger = logging.getLogger(__name__)

# If the RSS-supplied body is shorter than this, fetch the canonical URL and
# try to extract the full article with trafilatura. Analytical decomposition
# needs actual reasoning text — a 150-char teaser isn't enough.
FULL_FETCH_THRESHOLD_CHARS = 1200

# A browser-ish User-Agent is unfortunately required — several think-tank sites
# (Brookings, Crisis Group, etc.) 403 or serve bot-protection pages to anything
# that looks obviously like a crawler.
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36 basira/0.1"
)

_HTTP_TIMEOUT = httpx.Timeout(connect=10.0, read=20.0, write=10.0, pool=10.0)


@dataclass
class CandidateDocument:
    """A document discovered by ingestion, not yet persisted."""

    source_id: int
    canonical_url: str
    title: str
    body: str | None = None
    abstract: str | None = None
    authors: list[str] = field(default_factory=list)
    published_at: datetime | None = None
    language: str | None = None
    raw: dict | None = None


def _parse_published(entry) -> datetime | None:
    for key in ("published_parsed", "updated_parsed"):
        tm = entry.get(key)
        if tm:
            try:
                return datetime.fromtimestamp(mktime(tm))
            except Exception:
                continue
    return None


def _extract_body(entry) -> tuple[str | None, str | None]:
    """Return (abstract, body). RSS is terse; body is usually the summary."""
    summary = entry.get("summary") or ""
    content_blocks = entry.get("content") or []
    if content_blocks and isinstance(content_blocks, list):
        body = " ".join(
            c.get("value", "") for c in content_blocks if isinstance(c, dict)
        ).strip()
    else:
        body = ""
    if body:
        return (summary or body[:500], body)
    return (summary or None, summary or None)


def _strip_html(text: str) -> str:
    """Cheap HTML strip — good enough for RSS summaries."""
    if not text:
        return ""
    import re as _re

    text = _re.sub(r"<script[\s\S]*?</script>", "", text, flags=_re.IGNORECASE)
    text = _re.sub(r"<style[\s\S]*?</style>", "", text, flags=_re.IGNORECASE)
    text = _re.sub(r"<[^>]+>", " ", text)
    text = _re.sub(r"\s+", " ", text)
    return text.strip()


def _fetch_full_article(url: str) -> tuple[str | None, str | None]:
    """Fetch the article URL and extract full body + abstract with trafilatura.

    Returns (abstract, body) or (None, None) on failure. Caller treats
    failure as "keep whatever the RSS gave us" — so a 404 or a paywall
    falls back gracefully instead of dropping the document.
    """
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
    }
    try:
        with httpx.Client(
            headers=headers, follow_redirects=True, timeout=_HTTP_TIMEOUT
        ) as client:
            resp = client.get(url)
            if resp.status_code >= 400:
                return None, None
            html = resp.text
    except Exception as e:
        logger.debug("full-article fetch failed for %s: %s", url, e)
        return None, None

    try:
        extracted = trafilatura.bare_extraction(
            html,
            url=url,
            include_comments=False,
            include_tables=False,
            favor_precision=True,
            with_metadata=False,
        )
    except Exception as e:
        logger.debug("trafilatura failed for %s: %s", url, e)
        return None, None
    if not extracted:
        return None, None
    as_dict = extracted.as_dict() if hasattr(extracted, "as_dict") else dict(extracted)
    body = (as_dict.get("text") or "").strip()
    if not body or len(body) < 400:
        return None, None
    abstract = body[:500]
    return abstract, body[:30000]


def _fetch_feed_bytes(url: str) -> bytes | None:
    """Fetch feed content via httpx so we control the User-Agent and follow
    redirects cleanly. Returns None on any network error."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
    }
    try:
        with httpx.Client(
            headers=headers, follow_redirects=True, timeout=_HTTP_TIMEOUT
        ) as client:
            resp = client.get(url)
            if resp.status_code >= 400:
                logger.warning("feed fetch %s returned HTTP %d", url, resp.status_code)
                return None
            return resp.content
    except Exception as e:
        logger.warning("feed fetch %s failed: %s", url, e)
        return None


def fetch_source(src: Source, limit: int = 30) -> list[CandidateDocument]:
    """Pull up to `limit` recent entries from every RSS feed configured on
    this source. If `feeds_json` is unset, returns empty (caller falls back
    to universal scraper).
    """
    feeds = src.feeds_json or []
    if not feeds:
        return []

    candidates: list[CandidateDocument] = []
    for f in feeds:
        feed_type = (f.get("type") or "rss").lower() if isinstance(f, dict) else "rss"
        if feed_type not in ("rss", "atom"):
            continue
        url = f.get("url") if isinstance(f, dict) else f
        if not url:
            continue

        content = _fetch_feed_bytes(url)
        if not content:
            continue

        try:
            parsed = feedparser.parse(content)
        except Exception as e:
            logger.warning("feedparser failed for %s (%s): %s", src.slug, url, e)
            continue

        entries = (parsed.entries or [])[:limit]
        for e in entries:
            link = e.get("link") or ""
            title = e.get("title") or ""
            if not link or not title:
                continue
            abstract, body = _extract_body(e)
            abstract = _strip_html(abstract or "")[:2000]
            body = _strip_html(body or "")[:20000]

            # If the RSS teaser is too thin for analytical decomposition,
            # fetch the full article. This is the difference between
            # "storing a headline" and "storing an argument".
            fetch_source = "rss"
            if len(body or "") < FULL_FETCH_THRESHOLD_CHARS:
                full_abstract, full_body = _fetch_full_article(link)
                if full_body:
                    abstract = full_abstract or abstract
                    body = full_body
                    fetch_source = "rss+full_fetch"

            authors = []
            if e.get("authors"):
                authors = [a.get("name", "") for a in e["authors"] if a.get("name")]
            elif e.get("author"):
                authors = [e["author"]]

            candidates.append(
                CandidateDocument(
                    source_id=src.id,
                    canonical_url=link,
                    title=_strip_html(title),
                    abstract=abstract or None,
                    body=body or None,
                    authors=authors,
                    published_at=_parse_published(e),
                    language=e.get("language"),
                    raw={"feed_url": url, "fetch": fetch_source},
                )
            )
    return candidates
