# Option B — Supabase + GitHub Actions setup

This is the runbook for turning the headless Basira architecture on. After
these steps, Basira will run hourly in GitHub Actions, write to Supabase,
and Sada will read from Supabase directly — no laptop, no tunnel, no
VITE_BASIRA_URL.

## 1. Run the Supabase schema migration

1. Open your Supabase project → SQL editor → New query.
2. Paste the entire contents of `supabase/migrations/20260416_depth.sql`.
3. Run. It creates three tables (`depth_sources`, `depth_documents`,
   `depth_analyses`), enables RLS with anon-read policies, and creates
   the `depth_feed` view that Sada queries.

Sanity check:

```sql
select count(*) from depth_sources;    -- 0
select count(*) from depth_documents;  -- 0
select count(*) from depth_feed;       -- 0
```

## 2. Migrate existing SQLite data (one-shot)

Copies 308 sources + 492 documents + 1 analysis from the local SQLite DB
into Supabase. Idempotent — safe to re-run.

```bash
cd basira
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"  # from Supabase → Settings → API
uv sync
uv run python -m scripts.migrate_sqlite_to_supabase
```

Expected output: `sources: 308`, `documents: 492`, `analyses: 1`.

## 3. Add GitHub Actions secrets

In the repo → Settings → Secrets and variables → Actions → New repository
secret, add all three:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role key (bypasses RLS) |
| `ANTHROPIC_API_KEY` | optional; if unset, docs stay `pending` |

Optional repo-level variables (Settings → Variables → Actions) to tune
throughput without editing YAML:

| Name | Default |
|---|---|
| `BASIRA_MAX_SOURCES` | 999 |
| `BASIRA_MAX_PER_SOURCE` | 20 |
| `BASIRA_ANALYZE_BUDGET` | 40 |
| `BASIRA_MINIMAL_MODEL` | `claude-haiku-4-5` |

## 4. First manual run

Push the repo, then trigger the workflow manually so you don't have to
wait for the cron:

- GitHub → Actions → `basira-ingest` → **Run workflow** → Run

Watch the log. Expected: the worker logs something like

```
starting ingest pass (max_sources=999 max_per_source=20)
ingest pass: 308 active sources, 492 known hashes
...
starting analyze pass (budget=40)
analyze pass: 40 pending (budget 40)
...
worker finished: {...}
```

After it completes, confirm new rows in Supabase:

```sql
select count(*) from depth_documents where analysis_status = 'pending';
select count(*) from depth_analyses where prompt_variant = 'minimal';
```

From then on, the cron fires at `:07` every hour automatically.

## 5. Point Sada at Supabase (no rebuild needed)

`src/lib/useDepth.js` already reads from the Supabase client. The only
env vars it needs are `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`,
which Sada already has in `.env`. **`VITE_BASIRA_URL` is no longer
used and can be deleted from `.env`.**

Rebuild + deploy Sada:

```bash
npm run build
npx wrangler pages deploy dist --project-name=sada-app
```

The depth tab should now load directly from Supabase with no tunnel,
no localhost dependency, and no 503s when your laptop is closed.

## 6. Verify end-to-end

- Open the deployed Sada URL → depth tab → cards render from Supabase.
- Kill any local Basira/uvicorn process. Reload Sada. Cards still render.
- Wait for the next hourly cron tick (or trigger manually). New docs
  appear in Supabase and in Sada within 5 minutes (Sada polls every
  5 min).

## Rollback

If something breaks, Sada's old hook is one commit away and the local
SQLite database is untouched. Re-enable `VITE_BASIRA_URL=http://localhost:8000`,
revert `src/lib/useDepth.js` to the previous revision, start uvicorn,
and you're back to the old world.
