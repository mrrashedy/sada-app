"""Universal fallback scraper.

For any source without configured RSS or list selectors, this scraper:
  1. Fetches the source's homepage.
  2. Discovers candidate article links via common URL patterns
     (/publication/, /report/, /analysis/, /policy-brief/, year patterns).
  3. For each candidate, follows the link and runs `trafilatura` to extract
     title + main body text.
  4. Returns the candidates the pipeline can persist.

Lower fidelity than a hand-written scraper, but covers the long tail of
309 sources without having to write 309 scrapers.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from urllib.parse import urljoin, urlparse

import httpx
import trafilatura
from selectolax.parser import HTMLParser

from app.ingest.rss import USER_AGENT, CandidateDocument
from app.models.source import Source

logger = logging.getLogger(__name__)


# URL segments that look like article pages.
ARTICLE_PATTERNS = [
    re.compile(p)
    for p in (
        r"/publications?/",
        r"/publication-",
        r"/reports?/",
        r"/papers?/",
        r"/working-papers?/",
        r"/policy-brief",
        r"/brief/",
        r"/analysis/",
        r"/analyses/",
        r"/commentary/",
        r"/commentaries/",
        r"/article/",
        r"/articles/",
        r"/research/",
        r"/insight",
        r"/op-eds?/",
        r"/perspectives?/",
        r"/studies/",
        r"/statements?/",
        r"/speech/",
        r"/press-release",
        r"/news/",
        r"/20\d{2}/\d{1,2}/",  # year/month in URL
    )
]

# URL segments that are clearly NOT article pages.
SKIP_PATTERNS = [
    re.compile(p)
    for p in (
        r"/tag/",
        r"/tags/",
        r"/category/",
        r"/categories/",
        r"/author/",
        r"/authors/",
        r"/login",
        r"/register",
        r"/subscribe",
        r"/donate",
        r"/contact",
        r"/about/?$",
        r"/privacy",
        r"/terms",
        r"/cookie",
        r"/search/?$",
        r"/feed/?$",
        r"/rss",
        r"/sitemap",
        r"\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|mp3)$",
        r"/page/\d+/?$",
        r"#",
        r"mailto:",
        r"javascript:",
    )
]


def _looks_like_article(url: str) -> bool:
    for pat in SKIP_PATTERNS:
        if pat.search(url):
            return False
    for pat in ARTICLE_PATTERNS:
        if pat.search(url):
            return True
    return False


def _discover_candidate_links(base_url: str, html: str, max_links: int = 25) -> list[str]:
    """Walk the <a> tags on the homepage and pick candidates."""
    tree = HTMLParser(html)
    base_host = urlparse(base_url).netloc.replace("www.", "")

    seen: set[str] = set()
    candidates: list[str] = []

    for a in tree.css("a[href]"):
        href = a.attributes.get("href") or ""
        if not href or href.startswith(("#", "mailto:", "javascript:")):
            continue

        absolute = urljoin(base_url, href)
        host = urlparse(absolute).netloc.replace("www.", "")
        # Stay on the source's own domain (no outbound links).
        if host and host != base_host:
            continue

        if not _looks_like_article(absolute):
            continue

        if absolute in seen:
            continue
        seen.add(absolute)
        candidates.append(absolute)
        if len(candidates) >= max_links:
            break

    return candidates


def _extract_with_trafilatura(html: str, url: str) -> dict | None:
    """Use trafilatura to pull the article's main body + metadata."""
    try:
        result = trafilatura.bare_extraction(
            html,
            url=url,
            include_comments=False,
            include_tables=False,
            favor_precision=True,
            with_metadata=True,
        )
    except Exception as e:
        logger.debug("trafilatura failed for %s: %s", url, e)
        return None
    if not result:
        return None
    # bare_extraction returns a Document object in recent versions.
    as_dict = result.as_dict() if hasattr(result, "as_dict") else dict(result)
    return as_dict


def fetch_source(src: Source, max_docs: int = 10) -> list[CandidateDocument]:
    """Fetch the source's homepage and extract up to `max_docs` articles."""
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"}
    timeout = httpx.Timeout(connect=10.0, read=20.0, write=10.0, pool=10.0)

    try:
        with httpx.Client(
            headers=headers, follow_redirects=True, timeout=timeout
        ) as client:
            resp = client.get(src.url)
            resp.raise_for_status()
            html = resp.text
    except Exception as e:
        logger.warning("homepage fetch failed for %s: %s", src.slug, e)
        return []

    candidate_urls = _discover_candidate_links(src.url, html, max_links=max_docs * 2)
    if not candidate_urls:
        logger.info("no article candidates discovered on %s", src.slug)
        return []

    candidates: list[CandidateDocument] = []
    with httpx.Client(
        headers=headers, follow_redirects=True, timeout=timeout
    ) as client:
        for url in candidate_urls[:max_docs]:
            try:
                r = client.get(url)
                r.raise_for_status()
            except Exception as e:
                logger.debug("article fetch failed for %s: %s", url, e)
                continue

            extracted = _extract_with_trafilatura(r.text, url)
            if not extracted:
                continue
            title = (extracted.get("title") or "").strip()
            body = (extracted.get("text") or "").strip()
            if not title or not body or len(body) < 300:
                continue

            # Quality filter: reject index/listing pages that trafilatura
            # still happily extracts (homepage, /publications, /press-releases,
            # /news/, etc.). These show up as cards in the UI but contain no
            # actual argument — just a list of links to the real articles.
            # Signals:
            #   - Title is a generic nav label ("News", "Publications",
            #     "الروابط الرئيسية", "Press Releases", etc.)
            #   - URL path ends in a bare listing segment
            #   - Body is suspiciously link-dense relative to its length
            tl = title.lower().strip()
            nav_titles = {
                "news", "publications", "press releases", "press release",
                "articles", "research", "reports", "analysis", "publication",
                "blog", "home", "about", "contact", "events", "media",
                "الروابط الرئيسية", "الرئيسية", "الأخبار", "أخبار",
                "المنشورات", "الإصدارات", "البيانات الصحفية", "البيانات",
                "التقارير", "الأبحاث", "المقالات",
            }
            if tl in nav_titles or title in nav_titles:
                logger.debug("skip nav-title page: %s (%s)", title, url)
                continue
            # URL ending in a listing segment with nothing specific after it
            from urllib.parse import urlparse as _urlparse
            path_tail = _urlparse(url).path.rstrip("/").rsplit("/", 1)[-1].lower()
            listing_tails = {
                "publications", "publication", "press-releases", "press-release",
                "news", "reports", "articles", "research", "analysis",
                "publicaciones", "actualites", "actualités",
            }
            if path_tail in listing_tails:
                logger.debug("skip listing-URL page: %s", url)
                continue

            authors = []
            author_val = extracted.get("author")
            if isinstance(author_val, list):
                authors = [str(a).strip() for a in author_val if a]
            elif isinstance(author_val, str):
                authors = [author_val.strip()]

            published_at = None
            date_val = extracted.get("date")
            if date_val:
                try:
                    published_at = datetime.fromisoformat(str(date_val))
                except Exception:
                    try:
                        published_at = datetime.strptime(str(date_val), "%Y-%m-%d")
                    except Exception:
                        published_at = None

            candidates.append(
                CandidateDocument(
                    source_id=src.id,
                    canonical_url=url,
                    title=title[:1000],
                    abstract=body[:500],
                    body=body[:20000],
                    authors=authors,
                    published_at=published_at,
                    language=extracted.get("language"),
                    raw={"strategy": "universal_fallback"},
                )
            )
    logger.info(
        "universal_fallback extracted %d/%d from %s",
        len(candidates),
        len(candidate_urls),
        src.slug,
    )
    return candidates
