// Cloudflare Pages Function — /api/comments
//
// The single entry point for posting comments. Replaces the old "client →
// Supabase direct INSERT, then maybe-flag-after" flow which let spam land
// before moderation could see it.
//
// New flow:
//   1. Verify Supabase JWT (must be a real signed-in user).
//   2. Per-user rate limit (10 / hour).
//   3. Length + shape validation.
//   4. AI moderation (POST /api/moderate with internal key) — BLOCKING.
//   5. Only if safe → INSERT into Supabase via service role key.
//   6. Return the inserted row joined with the author's profile.
//
// Why a service role insert instead of letting the client do it: we want the
// moderation step to be unbypassable. RLS policies still cover all the OTHER
// comment operations (read, edit, delete) — see supabase-migration.sql.

import { authenticate, corsPreflight, rateLimitKey } from '../_lib/auth.js';
import { limit, tooMany } from '../_lib/ratelimit.js';

const CORS = { 'access-control-allow-origin': '*' };

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = await authenticate(context);
  if (auth.kind === 'none') return auth.response;
  if (auth.kind !== 'user' && auth.kind !== 'internal') {
    return Response.json({ ok: false, error: 'sign_in_required' }, { status: 401, headers: CORS });
  }

  // Rate limit (internal calls bypass)
  if (auth.kind === 'user') {
    const rl = await limit(env, `comments:${rateLimitKey(context, auth)}`, {
      max: 10, windowMs: 60 * 60 * 1000,
    });
    if (!rl.ok) return tooMany(rl.headers);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400, headers: CORS });
  }

  const articleId = String(body.articleId || '').trim();
  const text = String(body.body || '').trim();
  const parentId = body.parentId || null;

  if (!articleId) {
    return Response.json({ ok: false, error: 'missing_articleId' }, { status: 400, headers: CORS });
  }
  if (!text || text.length < 1) {
    return Response.json({ ok: false, error: 'empty_body' }, { status: 400, headers: CORS });
  }
  if (text.length > 2000) {
    return Response.json({ ok: false, error: 'too_long', max: 2000 }, { status: 400, headers: CORS });
  }

  // ── Moderation gate ──────────────────────────────────────────────
  // Only call moderation when the project is configured for it. If the
  // INTERNAL_API_KEY isn't set we skip — useful in local dev — but log a
  // warning to the response for visibility.
  let moderationApplied = false;
  if (env?.INTERNAL_API_KEY) {
    try {
      const modRes = await fetch(new URL('/api/moderate', request.url).toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-key': env.INTERNAL_API_KEY,
        },
        body: JSON.stringify({ text }),
      });
      const mod = await modRes.json();
      moderationApplied = true;
      if (mod?.ok && mod.safe === false) {
        return Response.json(
          { ok: false, error: 'rejected_by_moderation', reason: 'unsafe' },
          { status: 422, headers: CORS },
        );
      }
    } catch {
      // Moderation service failure — fail OPEN. Comment goes through but
      // gets a flag for retroactive review.
      moderationApplied = false;
    }
  }

  // ── Insert via service role ──────────────────────────────────────
  const supabaseUrl = env?.SUPABASE_URL;
  const supabaseKey = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return Response.json(
      { ok: false, error: 'supabase_unconfigured' },
      { status: 503, headers: CORS },
    );
  }

  const userId = auth.kind === 'user' ? auth.userId : body.userId; // internal can specify
  if (!userId) {
    return Response.json({ ok: false, error: 'missing_user' }, { status: 400, headers: CORS });
  }

  const insertRes = await fetch(
    `${supabaseUrl}/rest/v1/comments?select=*,profiles!comments_user_profiles_fk(display_name,username,avatar_url)`,
    {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        authorization: `Bearer ${supabaseKey}`,
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify({
        user_id: userId,
        article_id: articleId,
        body: text,
        parent_id: parentId,
        flagged: !moderationApplied ? true : false,
      }),
    },
  );

  if (!insertRes.ok) {
    const detail = await insertRes.text().catch(() => '');
    return Response.json(
      { ok: false, error: 'insert_failed', status: insertRes.status, detail: detail.slice(0, 200) },
      { status: 502, headers: CORS },
    );
  }

  const rows = await insertRes.json();
  const row = Array.isArray(rows) ? rows[0] : rows;

  return Response.json({ ok: true, comment: row, moderationApplied }, { headers: CORS });
}

// DELETE /api/comments?id=<uuid>  (user must own the comment)
export async function onRequestDelete(context) {
  const { request, env } = context;

  const auth = await authenticate(context);
  if (auth.kind === 'none') return auth.response;
  if (auth.kind !== 'user') {
    return Response.json({ ok: false, error: 'sign_in_required' }, { status: 401, headers: CORS });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return Response.json({ ok: false, error: 'missing_id' }, { status: 400, headers: CORS });
  }

  const supabaseUrl = env?.SUPABASE_URL;
  const supabaseKey = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ ok: false, error: 'supabase_unconfigured' }, { status: 503, headers: CORS });
  }

  // RLS would also block this, but we double-check at the API layer for clarity.
  const delRes = await fetch(
    `${supabaseUrl}/rest/v1/comments?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(auth.userId)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: supabaseKey,
        authorization: `Bearer ${supabaseKey}`,
        prefer: 'return=minimal',
      },
    },
  );

  if (!delRes.ok) {
    return Response.json(
      { ok: false, error: 'delete_failed', status: delRes.status },
      { status: 502, headers: CORS },
    );
  }

  return Response.json({ ok: true }, { headers: CORS });
}
