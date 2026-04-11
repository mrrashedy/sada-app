// /api/admin/topics
//
// GET    : returns the current trending list (cached) merged with all
//          radar_overrides so the admin UI can see what the radar shows
//          and what's pinned/hidden.
//
// POST   : create or update a radar override.
//          Body: { word, action: 'pin'|'hide'|'add', weight?, expires_at? }
//
// DELETE : remove a radar override.
//          Query: ?id=<uuid>   OR   ?word=<word>&action=<pin|hide|add>
//
// All methods require admin auth.

import { requireAdmin, supabaseService, logCuration } from '../../_lib/admin.js';
import { jsonResponse, corsPreflight } from '../../_lib/auth.js';

const VALID_ACTIONS = ['pin', 'hide', 'add'];

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
    if (request.method === 'GET') return await handleList(env, sb);
    if (request.method === 'POST') return await handleUpsert(env, sb, request, guard);
    if (request.method === 'DELETE') return await handleDelete(env, sb, request, guard);
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, { status: 405 });
  } catch (e) {
    return jsonResponse({ ok: false, error: e.message }, { status: 500 });
  }
}

// ── List: current trending merged with overrides ────────────────────
async function handleList(env, sb) {
  const feedCache = env?.FEED_CACHE;

  // 1. Compute live trending from cached feed (lightweight version)
  let liveTrending = [];
  if (feedCache) {
    const cached = await feedCache.get('feed:latest', 'json');
    if (cached?.feed) {
      const tagFreq = {};
      cached.feed.forEach(f => (f.categories || []).forEach(c => {
        if (c !== 'عاجل' && c.length > 1 && c.length < 25) {
          tagFreq[c] = (tagFreq[c] || 0) + 1;
        }
      }));
      liveTrending = Object.entries(tagFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([word, count]) => ({ word, count }));
    }
  }

  // 2. Pull all overrides
  const overrides = await sb.select('radar_overrides', 'select=*&order=created_at.desc');

  // 3. Annotate the live list with override state
  const overrideByWord = new Map();
  overrides.forEach(o => {
    const key = `${o.word}|${o.action}`;
    overrideByWord.set(key, o);
  });

  const annotated = liveTrending.map(t => ({
    ...t,
    pinned: overrideByWord.has(`${t.word}|pin`),
    hidden: overrideByWord.has(`${t.word}|hide`),
  }));

  // 4. Manual "add" topics that don't appear in live trending
  const liveWords = new Set(liveTrending.map(t => t.word));
  const manualAdds = overrides
    .filter(o => o.action === 'add' && !liveWords.has(o.word))
    .map(o => ({
      word: o.word,
      count: o.weight || 5,
      pinned: false,
      hidden: false,
      manual: true,
    }));

  return jsonResponse({
    ok: true,
    trending: [...annotated, ...manualAdds],
    overrides,
    counts: {
      live: liveTrending.length,
      pinned: overrides.filter(o => o.action === 'pin').length,
      hidden: overrides.filter(o => o.action === 'hide').length,
      added: overrides.filter(o => o.action === 'add').length,
    },
  });
}

// ── Upsert: create or update an override ────────────────────────────
async function handleUpsert(env, sb, request, guard) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'invalid_json' }, { status: 400 }); }

  const word = String(body?.word || '').trim();
  const action = String(body?.action || '').trim();

  if (!word) return jsonResponse({ ok: false, error: 'missing_word' }, { status: 400 });
  if (word.length > 100) return jsonResponse({ ok: false, error: 'word_too_long' }, { status: 400 });
  if (!VALID_ACTIONS.includes(action)) {
    return jsonResponse({ ok: false, error: 'invalid_action' }, { status: 400 });
  }

  const row = {
    word,
    action,
    weight: Number.isFinite(+body.weight) ? +body.weight : 5,
    expires_at: body.expires_at || null,
    created_by: guard.userId || null,
  };

  const result = await sb.insert('radar_overrides', [row], { upsert: true });

  await logCuration(env, {
    actorId: guard.userId,
    action: `topic_${action}`,
    targetKind: 'topic',
    targetId: word,
    payload: { weight: row.weight },
  });

  return jsonResponse({ ok: true, override: result?.[0] || row });
}

// ── Delete ──────────────────────────────────────────────────────────
async function handleDelete(env, sb, request, guard) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const word = url.searchParams.get('word');
  const action = url.searchParams.get('action');

  let query;
  if (id) {
    query = `id=eq.${encodeURIComponent(id)}`;
  } else if (word && action) {
    query = `word=eq.${encodeURIComponent(word)}&action=eq.${encodeURIComponent(action)}`;
  } else {
    return jsonResponse({ ok: false, error: 'missing_id_or_word_action' }, { status: 400 });
  }

  await sb.delete('radar_overrides', query);

  await logCuration(env, {
    actorId: guard.userId,
    action: 'clear_topic_override',
    targetKind: 'topic',
    targetId: word || id,
  });

  return jsonResponse({ ok: true });
}
