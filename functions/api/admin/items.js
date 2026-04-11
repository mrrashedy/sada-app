// /api/admin/items
//
// Editorial feed items — manually-authored articles that surface in /api/feeds
// alongside the RSS-fetched ones.
//
// GET    : list all manual items (newest first), including expired
// POST   : create a new item
//          Body: { title, body?, link?, image?, source_name?, source_initial?,
//                  category?, is_breaking?, pinned?, expires_at? }
// PATCH  : update an existing item by id
//          Query: ?id=<uuid>   Body: any subset of POST fields
// DELETE : remove an item
//          Query: ?id=<uuid>
//
// All methods require admin auth.

import { requireAdmin, supabaseService, logCuration } from '../../_lib/admin.js';
import { jsonResponse, corsPreflight } from '../../_lib/auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return corsPreflight();

  const guard = await requireAdmin(context);
  if (!guard.ok) return guard.response;

  const sb = supabaseService(env);
  if (!sb) {
    return jsonResponse({ ok: false, error: 'supabase_service_role_unconfigured' }, { status: 503 });
  }

  try {
    if (request.method === 'GET') return await handleList(sb);
    if (request.method === 'POST') return await handleCreate(env, sb, request, guard);
    if (request.method === 'PATCH') return await handleUpdate(env, sb, request, guard);
    if (request.method === 'DELETE') return await handleDelete(env, sb, request, guard);
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, { status: 405 });
  } catch (e) {
    return jsonResponse({ ok: false, error: e.message }, { status: 500 });
  }
}

// ── List ─────────────────────────────────────────────────────────────
async function handleList(sb) {
  const items = await sb.select('manual_feed_items', 'select=*&order=created_at.desc&limit=100');
  return jsonResponse({ ok: true, count: items.length, items });
}

// ── Create ───────────────────────────────────────────────────────────
function sanitizeItem(body) {
  const errors = [];
  const title = String(body?.title || '').trim();
  if (!title) errors.push('missing_title');
  if (title.length > 500) errors.push('title_too_long');
  const bodyText = body?.body ? String(body.body).slice(0, 5000) : null;
  return {
    errors,
    row: {
      title,
      body: bodyText,
      link: body?.link ? String(body.link).slice(0, 1000) : null,
      image: body?.image ? String(body.image).slice(0, 1000) : null,
      source_name: body?.source_name ? String(body.source_name).slice(0, 100) : 'تحرير',
      source_initial: body?.source_initial ? String(body.source_initial).slice(0, 4) : 'ت',
      category: body?.category ? String(body.category).slice(0, 100) : null,
      is_breaking: !!body?.is_breaking,
      pinned: body?.pinned !== false, // default true
      expires_at: body?.expires_at || null,
    },
  };
}

async function handleCreate(env, sb, request, guard) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'invalid_json' }, { status: 400 }); }

  const { errors, row } = sanitizeItem(body);
  if (errors.length) return jsonResponse({ ok: false, error: errors[0] }, { status: 400 });

  row.created_by = guard.userId || null;

  const result = await sb.insert('manual_feed_items', [row]);
  const created = result?.[0];

  await logCuration(env, {
    actorId: guard.userId,
    action: 'create_manual_item',
    targetKind: 'manual_item',
    targetId: created?.id,
    payload: { title: row.title, source_name: row.source_name },
  });

  return jsonResponse({ ok: true, item: created }, { status: 201 });
}

// ── Update ───────────────────────────────────────────────────────────
async function handleUpdate(env, sb, request, guard) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonResponse({ ok: false, error: 'missing_id' }, { status: 400 });

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'invalid_json' }, { status: 400 }); }

  // Build a partial update — only the fields the client sent.
  const allowed = ['title', 'body', 'link', 'image', 'source_name', 'source_initial',
                   'category', 'is_breaking', 'pinned', 'expires_at'];
  const update = {};
  for (const k of allowed) {
    if (k in body) update[k] = body[k];
  }
  if (update.title !== undefined) {
    update.title = String(update.title).trim();
    if (!update.title) return jsonResponse({ ok: false, error: 'missing_title' }, { status: 400 });
    if (update.title.length > 500) return jsonResponse({ ok: false, error: 'title_too_long' }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const result = await sb.update('manual_feed_items', `id=eq.${encodeURIComponent(id)}`, update);

  await logCuration(env, {
    actorId: guard.userId,
    action: 'update_manual_item',
    targetKind: 'manual_item',
    targetId: id,
    payload: Object.keys(update),
  });

  return jsonResponse({ ok: true, item: result?.[0] });
}

// ── Delete ───────────────────────────────────────────────────────────
async function handleDelete(env, sb, request, guard) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonResponse({ ok: false, error: 'missing_id' }, { status: 400 });

  await sb.delete('manual_feed_items', `id=eq.${encodeURIComponent(id)}`);

  await logCuration(env, {
    actorId: guard.userId,
    action: 'delete_manual_item',
    targetKind: 'manual_item',
    targetId: id,
  });

  return jsonResponse({ ok: true });
}
