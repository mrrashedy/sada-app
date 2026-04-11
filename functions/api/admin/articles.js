// /api/admin/articles
//
// GET    : returns the current cached feed (newest 200) merged with any
//          existing overrides, so the admin UI can show real article cards
//          with their current state (hidden / pinned / featured).
//
// POST   : sets/updates an override for one article.
//          Body: { article_id, link?, hidden?, pinned?, featured?,
//                  custom_title?, custom_body?, notes? }
//
// DELETE : clears the override for one article.
//          Query: ?article_id=...
//
// All methods require admin auth (env ADMIN_USER_IDS — see _lib/admin.js).

import { requireAdmin, supabaseService, logCuration } from '../../_lib/admin.js';
import { jsonResponse, corsPreflight } from '../../_lib/auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return corsPreflight();

  const guard = await requireAdmin(context);
  if (!guard.ok) return guard.response;

  const sb = supabaseService(env);
  if (!sb) {
    return jsonResponse(
      { ok: false, error: 'supabase_service_role_unconfigured' },
      { status: 503 },
    );
  }

  try {
    if (request.method === 'GET') return await handleList(env, sb);
    if (request.method === 'POST') return await handleUpsert(env, sb, request, guard);
    if (request.method === 'DELETE') return await handleDelete(env, sb, request, guard);
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, { status: 405 });
  } catch (e) {
    return jsonResponse({ ok: false, error: e.message }, { status: 500 });
  }
}

// ── List: cached feed merged with current overrides ─────────────────
async function handleList(env, sb) {
  const feedCache = env?.FEED_CACHE;
  if (!feedCache) {
    return jsonResponse({ ok: false, error: 'feed_cache_unbound' }, { status: 503 });
  }

  const cached = await feedCache.get('feed:latest', 'json');
  if (!cached?.feed) {
    return jsonResponse({ ok: true, items: [], overrides: [], count: 0 });
  }

  // Pull all overrides at once — table is small (admin-curated)
  const overrides = await sb.select('article_overrides', 'select=*');
  const byId = new Map(overrides.map(o => [o.article_id, o]));
  const byLink = new Map(overrides.filter(o => o.link).map(o => [o.link, o]));

  const items = cached.feed.slice(0, 200).map(f => {
    const ov = byId.get(f.id) || (f.link && byLink.get(f.link)) || null;
    return {
      id: f.id,
      title: f.title,
      body: f.body,
      link: f.link,
      image: f.image,
      timestamp: f.timestamp,
      time: f.time,
      isBreaking: f.isBreaking,
      categories: f.categories,
      source: f.source,
      override: ov ? {
        hidden: ov.hidden, pinned: ov.pinned, featured: ov.featured,
        custom_title: ov.custom_title, custom_body: ov.custom_body,
        notes: ov.notes, updated_at: ov.updated_at,
      } : null,
    };
  });

  return jsonResponse({
    ok: true,
    count: items.length,
    items,
    overrides_total: overrides.length,
    cache_age: cached?._meta?.ts ? Date.now() - cached._meta.ts : null,
  });
}

// ── Upsert: set or update an override ────────────────────────────────
async function handleUpsert(env, sb, request, guard) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'invalid_json' }, { status: 400 }); }

  if (!body?.article_id) {
    return jsonResponse({ ok: false, error: 'missing_article_id' }, { status: 400 });
  }

  // Whitelist of writable columns
  const row = {
    article_id: String(body.article_id),
    link: body.link || null,
    hidden: !!body.hidden,
    pinned: !!body.pinned,
    featured: !!body.featured,
    custom_title: body.custom_title || null,
    custom_body: body.custom_body || null,
    notes: body.notes || null,
    updated_by: guard.userId || null,
    updated_at: new Date().toISOString(),
  };

  const result = await sb.insert('article_overrides', [row], { upsert: true });

  // Audit (best-effort, non-blocking semantics — but cheap so we await)
  await logCuration(env, {
    actorId: guard.userId,
    action: 'set_article_override',
    targetKind: 'article',
    targetId: row.article_id,
    payload: { hidden: row.hidden, pinned: row.pinned, featured: row.featured },
  });

  return jsonResponse({ ok: true, override: result?.[0] || row });
}

// ── Delete: remove an override ───────────────────────────────────────
async function handleDelete(env, sb, request, guard) {
  const url = new URL(request.url);
  const articleId = url.searchParams.get('article_id');
  if (!articleId) {
    return jsonResponse({ ok: false, error: 'missing_article_id' }, { status: 400 });
  }
  await sb.delete('article_overrides', `article_id=eq.${encodeURIComponent(articleId)}`);
  await logCuration(env, {
    actorId: guard.userId,
    action: 'clear_article_override',
    targetKind: 'article',
    targetId: articleId,
  });
  return jsonResponse({ ok: true });
}
