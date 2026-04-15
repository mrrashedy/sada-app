# Basira — بصيرة

**An independent geopolitical research engine.**
Monitors think tanks, official sources, multilateral institutions, universities,
long-form media, datasets, and major conferences — and extracts the analytical
scaffolding behind every piece. Educate, don't alert.

> A patient, analytical companion that reads the world's most thoughtful
> geopolitical papers so that when you sit down to think, you are thinking
> with the field, not against it.

---

## What it does

Over **309 curated sources** across 9 categories (governments, multilaterals,
think tanks, universities, specialized research, long-form media, datasets,
and major conferences), Basira runs a continuous loop:

1. **Watches** every source on a tier-based schedule (Tier 1 hourly, Tier 2
   every 6h, Tier 3 daily).
2. **Pulls in** new documents — papers, policy briefs, official statements,
   working papers, conference outputs, dataset releases, long-form analyses.
   Uses RSS where available and a universal fallback scraper for the rest.
3. **Reads each one with Claude** to extract a structured analytical
   scaffold: thesis, key arguments, methodology, theoretical framework,
   named regions and actors, counterarguments, limitations, implications,
   and Arabic + English summaries. The prompt adapts to the document's
   category — a White House statement is analyzed differently than a
   Carnegie paper or an ACLED dataset release.
4. **Exposes a clean REST API** with dual response shapes (`full` for native
   use, `feed` for drop-in compatibility with Sada's existing card components).
5. **Renders a minimal reader UI** so you can browse the corpus from day one.

Editorial principle: **less emotional, more logical. Less spotlight, more
enlightenment. Educate, don't alert.**

---

## Prerequisites

- **macOS or Linux** (tested on macOS 15 with Apple Silicon)
- **`uv`** — the Python package manager. If you don't have it:
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
- **Python 3.12** — `uv` will install this for you on first run.
- **API keys** (required for the analysis layer; ingestion works without them):
  - An **Anthropic API key** from https://console.anthropic.com/
  - A **Voyage AI API key** from https://www.voyageai.com/

You do NOT need Docker, Homebrew, Postgres, or a JavaScript toolchain.

---

## Install

```bash
cd "/Users/a101/untitled folder/basira"
uv sync
```

This creates a `.venv/` with all dependencies locked.

Copy the env template and add your API keys:

```bash
cp .env.example .env
# edit .env and fill in ANTHROPIC_API_KEY, VOYAGE_API_KEY, BASIRA_ADMIN_TOKEN
```

Apply the database migration (creates `data/basira.db`):

```bash
uv run alembic upgrade head
```

---

## Run

```bash
uv run uvicorn app.main:app --reload --port 8000
```

Open:

- **Reader UI:** http://127.0.0.1:8000/
- **API docs (auto-generated):** http://127.0.0.1:8000/docs
- **Health check:** http://127.0.0.1:8000/api/health
- **Source list:** http://127.0.0.1:8000/sources

On first boot the server:
1. Creates the DB schema if missing.
2. Loads all 309 sources from `data/context_engine_sources_master.csv`.
3. Applies per-source overrides from `data/sources_overrides.yaml`.
4. Starts the APScheduler (if `BASIRA_SCHEDULER_ENABLED=1`).

---

## Ingesting content

Sources are polled automatically on schedule once the scheduler is wired in
Phase 2 cron jobs. To ingest a single source **on demand** right now:

```bash
uv run python -c "
from app.db import SessionLocal
from app.ingest.pipeline import ingest_source
from app.models.source import Source
db = SessionLocal()
src = db.query(Source).filter_by(slug='european-council-on-foreign-relations').one()
print(ingest_source(db, src.id, max_new=10))
db.close()
"
```

Or poll every Tier 1 source at once:

```bash
uv run python -c "
from app.db import SessionLocal
from app.ingest.pipeline import ingest_by_tier
db = SessionLocal()
result = ingest_by_tier(db, 'Tier 1', max_sources=20)
print(f\"found={result['found']} new={result['new']}\")
db.close()
"
```

## Running Claude analysis

Once documents are in the database with `analysis_status = 'pending'` and
your API keys are set in `.env`, run analysis:

```bash
uv run python -c "
from app.db import SessionLocal
from app.analyze.pipeline import analyze_document
from app.models.document import Document
db = SessionLocal()
pending = db.query(Document).filter_by(analysis_status='pending').limit(10).all()
for d in pending:
    try:
        analyze_document(db, d.id)
    except Exception as e:
        print(f'doc {d.id} failed: {e}')
db.close()
"
```

Each document costs about **$0.015** in Claude Sonnet API usage plus ~$0.0001
for the Voyage embedding — roughly **$70/month** at a steady ingestion rate
of 200–400 docs/day with Tier 1+2 analysis enabled (Tier 3 is skipped by
default to keep costs sane; flip on via `BASIRA_ANALYZE_TIERS` in `.env` when
you're ready).

---

## The source registry

The 309-source list lives at:

```
data/context_engine_sources_master.csv
```

Columns: `name, category, region, language, priority, url`. This is the
authoritative source-of-truth. **Adding or removing a source is one CSV
edit followed by a server restart (or a `POST /api/admin/reload-sources`
call).**

Per-source operational knobs (feeds, CSS selectors, scrape strategy) live in:

```
data/sources_overrides.yaml
```

Keyed by source slug (the slug is derived from the CSV `name` column). See
the file's header comment for the schema.

---

## API surface

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness check |
| `GET /api/sources` | List sources, filterable by `category`, `priority`, `region`, `language` |
| `GET /api/sources/stats` | Aggregate counts by category and tier |
| `GET /api/sources/{slug}` | Source detail |
| `GET /api/documents` | List documents, `?shape=full` or `?shape=feed` |
| `GET /api/documents/{id}` | Full document + analysis |
| `GET /api/topics` | Topic taxonomy (inferred from analyses) |
| `GET /api/admin/health` | Per-source ingestion health (auth required) |
| `POST /api/admin/reload-sources` | Reload sources from CSV (auth required) |
| `POST /api/admin/refresh/{slug}` | Force-poll a source (auth required) |

Auto-generated full docs at `/docs`.

### Dual response shape (the Sada-compatibility trick)

Every document-listing endpoint accepts `?shape=full` (default) or `?shape=feed`.

- **`full`** — the engine's native shape with the complete `Analysis` object.
- **`feed`** — a compact shape whose field names match Sada's existing feed
  cards (`id, title, brief, body, tags, tag, realImg, s:{n,logo,domain},
  pubTs, ...`). When you eventually point Sada at this engine, its React
  components render documents with **zero new card code**.

---

## Project layout

```
basira/
├── pyproject.toml            # deps + tool config
├── .env.example              # env var template
├── alembic/                  # DB migrations
├── data/
│   ├── basira.db             # SQLite DB (gitignored)
│   ├── context_engine_sources_master.csv   # 309 sources (source of truth)
│   ├── sources_overrides.yaml              # operational overlay
│   └── documents/            # cached PDF/HTML originals
└── app/
    ├── main.py               # FastAPI entry point
    ├── config.py             # Settings
    ├── db.py                 # SQLAlchemy engine + sqlite-vec
    ├── scheduler.py          # APScheduler jobs (Phase 2)
    ├── models/               # SQLAlchemy tables
    ├── schemas/              # Pydantic API shapes
    ├── api/                  # REST endpoints
    ├── ingest/               # Crawlers
    │   ├── loader.py         # CSV → DB
    │   ├── rss.py
    │   ├── universal_fallback.py  # long-tail scraper
    │   ├── dedupe.py
    │   └── pipeline.py
    ├── analyze/              # The brain
    │   ├── prompts.py        # 6 analytical prompt variants
    │   ├── claude.py
    │   ├── embeddings.py
    │   └── pipeline.py
    └── web/                  # Reader UI (Jinja2 + HTMX + Tailwind CDN)
```

---

## The analytical prompts

Six prompt variants, one per source category, all sharing a common editorial
constitution:

| Variant | For categories | Emphasizes |
|---|---|---|
| `research_paper` | `think_tank`, `university`, `specialized` | Thesis, key arguments, methodology, frameworks, limitations |
| `official_statement` | `official` | Signal (shift/continuation/ambiguity), audience, conspicuous silences |
| `multilateral_report` | `multilateral` | Mandate, data sources, findings, recipients, dissent |
| `long_form_media` | `media`, `think_tank_media` | Thesis, evidence quality, register, bias markers |
| `dataset_release` | `data` | Release version, covered period, methodology changes, answerable questions |
| `conference_output` | `conference` | Participants, points of disagreement, communique |

All share a non-negotiable editorial constitution:

1. Academic / analytical register only. No emotional or promotional language.
2. Do not speculate beyond the document's text.
3. Do not insert your own political opinions.
4. If the document is weak, vague, partisan, or evasive, say so — do not
   inflate it. Call out propaganda when you see it.
5. Stay focused on HOW and WHY, not WHAT and WHERE.
6. Educate the reader. Do not alert them.

Edit these prompts in `app/analyze/prompts.py`. This is the single most
important file for fulfilling the engine's mission.

---

## Path to Sada integration (when ready)

Basira is built to eventually become the analytical layer of the Sada app,
but it is **fully standalone for v1** so you can build, test, and live with it
before any integration work. When you're ready:

1. **Deploy** Basira to Railway or Fly.io.
2. **Add one env var to Sada:** `VITE_BASIRA_URL=https://basira.your-domain`.
3. **Add a new nav tab** to Sada's `src/App.jsx` (e.g. `{ id: 'context' }`).
4. **Write `src/lib/useBasira.js`** parallel to `useNews.js`. It fetches
   `${VITE_BASIRA_URL}/api/documents?shape=feed`.
5. **Render with the existing `Post` component** — the `shape=feed` response
   is already in the right shape. Zero new card code.
6. **Enrich the detail modal** to show the analytical scaffold when a user
   clicks through.

Port 8000 by default — no conflict with Sada's Vite dev server on 5173 or
preview on 4173.

---

## License

Private. All rights reserved.
