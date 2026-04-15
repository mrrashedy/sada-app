-- =====================================================================
-- Basira depth vertical — Supabase schema
-- =====================================================================
-- Three tables: depth_sources, depth_documents, depth_analyses.
-- Named with the depth_ prefix so they never collide with Sada's news
-- tables. RLS is enabled on all three: anon can SELECT (so Sada's
-- frontend can read over the anon key with no proxy), service_role
-- can INSERT/UPDATE/DELETE (used by the GitHub Actions ingest worker
-- and the one-shot SQLite→Supabase migration script).
--
-- Mirrors the existing Basira SQLite schema 1:1 so the migration
-- script is a straight row-by-row copy with no field remapping.
-- =====================================================================

-- ---------- sources ----------
create table if not exists public.depth_sources (
  id                         bigint primary key,
  slug                       text not null unique,
  name                       text not null,
  category                   text not null,
  region                     text not null,
  language                   text not null,
  priority                   text not null,
  url                        text not null,
  scrape_strategy            text not null,
  feeds_json                 jsonb,
  list_selector              text,
  link_selector              text,
  custom_scraper             text,
  polling_cadence            text,
  min_poll_interval_seconds  integer not null default 300,
  last_polled_at             timestamptz,
  last_seen_at               timestamptz,
  active                     boolean not null default true,
  created_at                 timestamptz not null default now()
);
create index if not exists depth_sources_category_idx on public.depth_sources (category);
create index if not exists depth_sources_priority_idx on public.depth_sources (priority);
create index if not exists depth_sources_active_idx   on public.depth_sources (active);

-- ---------- documents ----------
create table if not exists public.depth_documents (
  id                  bigint primary key,
  source_id           bigint not null references public.depth_sources(id) on delete cascade,
  canonical_url       text not null,
  dedupe_hash         text not null unique,
  document_type       text not null,
  title               text not null,
  title_ar            text,
  authors_json        jsonb,
  abstract            text,
  body                text,
  language            text,
  published_at        timestamptz,
  fetched_at          timestamptz not null default now(),
  pdf_path            text,
  html_path           text,
  analysis_status     text not null default 'pending',
  raw_metadata_json   jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists depth_documents_source_id_idx        on public.depth_documents (source_id);
create index if not exists depth_documents_published_at_idx     on public.depth_documents (published_at desc);
create index if not exists depth_documents_analysis_status_idx  on public.depth_documents (analysis_status);
create index if not exists depth_documents_status_pub_idx       on public.depth_documents (analysis_status, published_at desc);
create index if not exists depth_documents_document_type_idx    on public.depth_documents (document_type);

-- ---------- analyses ----------
-- One row per document. Holds the v2 analytical decomposition that
-- Claude produces. Every field is nullable — the minimal prompt
-- variant only fills analytical_conclusion + key_quotes_json and
-- leaves the rest null. The full v2 prompt fills everything.
create table if not exists public.depth_analyses (
  document_id             bigint primary key references public.depth_documents(id) on delete cascade,
  prompt_variant          text not null,
  -- v2 flagship fields
  analytical_conclusion   text,
  core_argument           text,
  supporting_logic        text,
  assumptions_json        jsonb,
  analytical_frame        text,
  tensions                text,
  if_correct_then         text,
  -- shared structural fields
  thesis                  text,
  key_points_json         jsonb,
  evidence_type           text,
  methodology             text,
  frameworks_json         jsonb,
  regions_json            jsonb,
  topics_json             jsonb,
  actors_json             jsonb,
  counterarguments        text,
  limitations             text,
  implications            text,
  ar_summary              text,
  en_summary              text,
  key_quotes_json         jsonb,
  extras_json             jsonb,
  -- provenance
  model                   text not null,
  prompt_version          text not null,
  input_tokens            integer,
  output_tokens           integer,
  created_at              timestamptz not null default now()
);
create index if not exists depth_analyses_prompt_variant_idx on public.depth_analyses (prompt_variant);

-- =====================================================================
-- Row-level security
-- =====================================================================
-- Sada's frontend reads with the anon key — so anon needs SELECT.
-- The worker writes with the service_role key — bypasses RLS anyway,
-- but we set explicit policies for clarity.
-- =====================================================================

alter table public.depth_sources   enable row level security;
alter table public.depth_documents enable row level security;
alter table public.depth_analyses  enable row level security;

-- Anon can read everything.
drop policy if exists depth_sources_select_anon   on public.depth_sources;
drop policy if exists depth_documents_select_anon on public.depth_documents;
drop policy if exists depth_analyses_select_anon  on public.depth_analyses;

create policy depth_sources_select_anon
  on public.depth_sources   for select  to anon, authenticated  using (true);

create policy depth_documents_select_anon
  on public.depth_documents for select  to anon, authenticated  using (true);

create policy depth_analyses_select_anon
  on public.depth_analyses  for select  to anon, authenticated  using (true);

-- No INSERT/UPDATE/DELETE policies for anon: writes go through the
-- service_role key from the GitHub Actions worker, which bypasses RLS.

-- =====================================================================
-- Convenience view — feed shape
-- =====================================================================
-- Sada's useDepth hook wants one flat query that joins document +
-- source + analysis. This view does the join once so the frontend
-- can do `from('depth_feed').select('*')` with no joins.
-- =====================================================================

create or replace view public.depth_feed as
select
  d.id,
  d.canonical_url,
  d.document_type,
  d.title,
  d.title_ar,
  d.authors_json          as authors,
  d.abstract,
  d.body,
  d.language,
  d.published_at,
  d.fetched_at,
  d.analysis_status,
  -- source fields flattened under s_*
  s.id                    as source_id,
  s.slug                  as source_slug,
  s.name                  as source_name,
  s.category,
  s.region,
  s.priority,
  s.url                   as source_url,
  -- analysis fields (null when pending)
  a.prompt_variant,
  a.analytical_conclusion,
  a.core_argument,
  a.supporting_logic,
  a.assumptions_json      as assumptions,
  a.analytical_frame,
  a.tensions,
  a.if_correct_then,
  a.thesis,
  a.key_points_json       as key_points,
  a.frameworks_json       as frameworks,
  a.regions_json          as regions,
  a.topics_json           as topics,
  a.actors_json           as actors,
  a.ar_summary,
  a.en_summary,
  a.key_quotes_json       as key_quotes,
  a.model                 as analysis_model,
  a.created_at            as analyzed_at
from public.depth_documents d
join public.depth_sources   s on s.id = d.source_id
left join public.depth_analyses a on a.document_id = d.id;

grant select on public.depth_feed to anon, authenticated;
