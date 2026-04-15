"""Source loader.

Reads the master CSV (your curated source list) and the operational overrides
YAML, and upserts rows into the `sources` table. Called on startup and via
POST /admin/reload-sources.

The CSV is the source-of-truth for name/category/region/language/priority/url.
The overrides YAML layers in engine-specific operational knobs (feeds, scrape
strategy, custom scrapers, polling cadence). Neither file is mutated — they're
read-only.
"""
from __future__ import annotations

import csv
import logging
from dataclasses import dataclass
from pathlib import Path

import yaml
from slugify import slugify
from sqlalchemy.orm import Session

from app.config import settings
from app.models.source import Source

logger = logging.getLogger(__name__)


@dataclass
class LoadResult:
    total_rows: int
    inserted: int
    updated: int
    skipped: int
    deactivated: int


def _read_csv(csv_path: Path) -> list[dict]:
    """Read the master CSV into a list of dicts. Handles the existing header shape."""
    rows: list[dict] = []
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            # Strip whitespace, skip blank rows.
            cleaned = {k: (v or "").strip() for k, v in raw.items()}
            if not cleaned.get("name") or not cleaned.get("url"):
                continue
            rows.append(cleaned)
    return rows


def _read_overrides(yaml_path: Path) -> dict[str, dict]:
    """Read the overrides YAML. Returns a dict keyed by source slug."""
    if not yaml_path.exists():
        return {}
    with yaml_path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    if not isinstance(data, dict):
        logger.warning("overrides YAML is not a dict, ignoring")
        return {}
    # The YAML is keyed by slug.
    return {str(k): dict(v) for k, v in data.items() if isinstance(v, dict)}


def _make_slug(name: str, url: str) -> str:
    """Deterministic slug from source name; falls back to domain if name collides."""
    base = slugify(name, max_length=80, lowercase=True)
    if not base:
        # Fallback: use the domain
        from urllib.parse import urlparse

        base = slugify(urlparse(url).netloc or "source", max_length=80)
    return base


def _normalize_category(category: str) -> str:
    """Snap a CSV category string onto our enum."""
    c = (category or "").strip().lower()
    allowed = {
        "official",
        "multilateral",
        "think_tank",
        "specialized",
        "university",
        "media",
        "data",
        "conference",
        "think_tank_media",
    }
    if c in allowed:
        return c
    # Accept a few common variants
    if c in ("think tank", "think-tank"):
        return "think_tank"
    if c in ("think tank media", "think-tank media"):
        return "think_tank_media"
    return c or "other"


def _normalize_priority(priority: str) -> str:
    """Snap priority onto Tier 1 / Tier 2 / Tier 3."""
    p = (priority or "").strip()
    if not p:
        return "Tier 3"
    if p.lower().startswith("tier"):
        # Try to canonicalize "tier 1" → "Tier 1"
        parts = p.split()
        if len(parts) == 2 and parts[1] in ("1", "2", "3"):
            return f"Tier {parts[1]}"
    if p in ("1", "2", "3"):
        return f"Tier {p}"
    return p


def load_sources(
    db: Session,
    csv_path: Path | None = None,
    overrides_path: Path | None = None,
) -> LoadResult:
    """Load sources from CSV + overrides into the DB. Idempotent."""
    csv_path = csv_path or settings.sources_csv
    overrides_path = overrides_path or settings.sources_overrides

    if not csv_path.exists():
        raise FileNotFoundError(f"Source CSV not found at {csv_path}")

    rows = _read_csv(csv_path)
    overrides = _read_overrides(overrides_path)

    logger.info("loading %d sources from %s", len(rows), csv_path)
    if overrides:
        logger.info("loading %d overrides from %s", len(overrides), overrides_path)

    inserted = 0
    updated = 0
    skipped = 0
    seen_slugs: set[str] = set()

    for row in rows:
        name = row["name"]
        url = row["url"]
        slug = _make_slug(name, url)

        # Disambiguate slug collisions by appending -2, -3, ...
        original_slug = slug
        n = 2
        while slug in seen_slugs:
            slug = f"{original_slug}-{n}"
            n += 1
        seen_slugs.add(slug)

        category = _normalize_category(row.get("category", ""))
        priority = _normalize_priority(row.get("priority", ""))
        region = row.get("region", "") or "Global"
        language = row.get("language", "") or "English"

        override = overrides.get(slug, {})

        existing = db.query(Source).filter_by(slug=slug).one_or_none()

        if existing is None:
            src = Source(
                slug=slug,
                name=name,
                category=category,
                region=region,
                language=language,
                priority=priority,
                url=url,
                scrape_strategy=override.get("scrape_strategy", "universal_fallback"),
                feeds_json=override.get("feeds"),
                list_selector=override.get("list_selector"),
                link_selector=override.get("link_selector"),
                custom_scraper=override.get("custom_scraper"),
                polling_cadence=override.get("polling_cadence"),
                min_poll_interval_seconds=int(
                    override.get("min_poll_interval_seconds", 900)
                ),
                active=bool(override.get("active", True)),
            )
            db.add(src)
            inserted += 1
        else:
            # Update CSV-sourced fields; leave operational fields alone unless override says so.
            existing.name = name
            existing.category = category
            existing.region = region
            existing.language = language
            existing.priority = priority
            existing.url = url

            if "scrape_strategy" in override:
                existing.scrape_strategy = override["scrape_strategy"]
            if "feeds" in override:
                existing.feeds_json = override["feeds"]
            if "list_selector" in override:
                existing.list_selector = override["list_selector"]
            if "link_selector" in override:
                existing.link_selector = override["link_selector"]
            if "custom_scraper" in override:
                existing.custom_scraper = override["custom_scraper"]
            if "polling_cadence" in override:
                existing.polling_cadence = override["polling_cadence"]
            if "min_poll_interval_seconds" in override:
                existing.min_poll_interval_seconds = int(override["min_poll_interval_seconds"])
            if "active" in override:
                existing.active = bool(override["active"])
            updated += 1

    # Deactivate any source that used to be in the DB but is no longer in the CSV.
    deactivated = 0
    for stale in db.query(Source).filter(Source.active.is_(True)).all():
        if stale.slug not in seen_slugs:
            stale.active = False
            deactivated += 1

    db.flush()

    return LoadResult(
        total_rows=len(rows),
        inserted=inserted,
        updated=updated,
        skipped=skipped,
        deactivated=deactivated,
    )
