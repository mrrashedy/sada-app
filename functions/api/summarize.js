// Cloudflare Pages Function — /api/summarize
//
// Generates AI summaries of news articles via Workers AI (Llama 3.1 8B) and
// caches them in Supabase `article_summaries` table so the same article never
// gets summarized twice. KV is also checked as a hot fallback.
//
// AUTH: requires either INTERNAL_API_KEY or a valid Supabase JWT. Anonymous
// users see "Sign in to read AI summary" — this is intentional, summaries are
// the carrot for creating an account, and it stops AI quota abuse.
//
// RATE LIMIT: 30 summaries per day per user.

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

  // Per-user daily limit (internal calls bypass)
  if (auth.kind !== 'internal') {
    const rl = await limit(env, `summarize:${rateLimitKey(context, auth)}`, {
      max: 30, windowMs: 24 * 60 * 60 * 1000,
    });
    if (!rl.ok) return tooMany(rl.headers);
  }

  let articleId, title, body;
  try {
    ({ articleId, title, body } = await request.json());
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400, headers: CORS });
  }

  if (!articleId || !title) {
    return Response.json({ ok: false, error: 'missing_articleId_or_title' }, { status: 400, headers: CORS });
  }

  const supabaseUrl = env?.SUPABASE_URL;
  const supabaseKey = env?.SUPABASE_SERVICE_ROLE_KEY;
  const ai = env?.AI || null;

  // 1) KV hot cache
  if (env?.FEED_CACHE) {
    try {
      const cached = await env.FEED_CACHE.get(`sum:${articleId}`);
      if (cached) {
        return Response.json(
          { ok: true, summary: cached, cached: 'kv' },
          { headers: { ...CORS, 'cache-control': 'public, max-age=3600' } },
        );
      }
    } catch {}
  }

  // 2) Supabase persistent cache
  if (supabaseUrl && supabaseKey) {
    try {
      const cacheRes = await fetch(
        `${supabaseUrl}/rest/v1/article_summaries?article_id=eq.${encodeURIComponent(articleId)}&select=summary_ar`,
        { headers: { apikey: supabaseKey, authorization: `Bearer ${supabaseKey}` } },
      );
      const cached = await cacheRes.json();
      if (cached?.[0]?.summary_ar) {
        // Backfill KV for next time
        if (env?.FEED_CACHE) {
          context.waitUntil(
            env.FEED_CACHE.put(`sum:${articleId}`, cached[0].summary_ar, { expirationTtl: 86400 }).catch(() => {}),
          );
        }
        return Response.json(
          { ok: true, summary: cached[0].summary_ar, cached: 'db' },
          { headers: { ...CORS, 'cache-control': 'public, max-age=3600' } },
        );
      }
    } catch {}
  }

  // 3) Generate via Workers AI
  if (!ai) {
    return Response.json(
      { ok: false, error: 'ai_unavailable' },
      { status: 503, headers: CORS },
    );
  }

  const text = `${title}\n\n${(body || '').slice(0, 2000)}`;
  const prompt = `أنت محلل إخباري عربي محترف. لخّص هذا الخبر في ٣ جمل واضحة ومركّزة باللغة العربية. التزم بالحياد ولا تضف آراءً شخصية.\n\nالخبر:\n${text}\n\nالملخص:`;

  let summary;
  try {
    const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'أنت محلل إخباري عربي. لخّص الأخبار بإيجاز ودقة.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 300,
      temperature: 0.3,
    });
    summary = result?.response?.trim();
  } catch (e) {
    return Response.json({ ok: false, error: 'ai_error', detail: e.message }, { status: 502, headers: CORS });
  }

  if (!summary) {
    return Response.json({ ok: false, error: 'empty_summary' }, { status: 502, headers: CORS });
  }

  // Persist to both layers — non-blocking
  if (env?.FEED_CACHE) {
    context.waitUntil(
      env.FEED_CACHE.put(`sum:${articleId}`, summary, { expirationTtl: 86400 }).catch(() => {}),
    );
  }
  if (supabaseUrl && supabaseKey) {
    context.waitUntil(
      fetch(`${supabaseUrl}/rest/v1/article_summaries`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          authorization: `Bearer ${supabaseKey}`,
          'content-type': 'application/json',
          prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ article_id: articleId, summary_ar: summary, model: 'llama-3.1-8b' }),
      }).catch(() => {}),
    );
  }

  return Response.json(
    { ok: true, summary, cached: false },
    { headers: { ...CORS, 'cache-control': 'public, max-age=3600' } },
  );
}
