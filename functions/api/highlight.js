// Cloudflare Pages Function — /api/highlight
//
// Given an article's title + body, returns 3–5 short key phrases that should
// be highlighted in the reader view. Uses Workers AI (Llama 3.1 8B Instruct)
// with a JSON-mode prompt, then validates that each returned phrase actually
// appears verbatim in the body (the model sometimes hallucinates, so we drop
// any phrase that's not an exact substring).
//
// Cached in FEED_CACHE KV for 24h under `hl:${articleId}`. No auth, no rate
// limit — highlights are cheap (~1 Workers AI call) and useful to anyone
// reading an article.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let articleId, title, body;
  try {
    ({ articleId, title, body } = await request.json());
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400, headers: CORS });
  }

  if (!articleId || !title || !body || typeof body !== 'string') {
    return Response.json({ ok: false, error: 'missing_fields' }, { status: 400, headers: CORS });
  }

  // Short bodies aren't worth highlighting — skip early
  if (body.length < 80) {
    return Response.json({ ok: true, phrases: [], cached: false, reason: 'body_too_short' }, {
      headers: { ...CORS, 'cache-control': 'public, s-maxage=300' },
    });
  }

  const feedCache = env?.FEED_CACHE || null;
  const ai = env?.AI || null;

  // 1. KV hot cache
  const cacheKey = `hl:${articleId}`;
  if (feedCache) {
    try {
      const cached = await feedCache.get(cacheKey, 'json');
      if (cached && Array.isArray(cached.phrases)) {
        return Response.json({ ok: true, phrases: cached.phrases, cached: true }, {
          headers: { ...CORS, 'cache-control': 'public, s-maxage=300' },
        });
      }
    } catch {}
  }

  if (!ai) {
    return Response.json({ ok: false, error: 'ai_unavailable', phrases: [] }, {
      status: 503, headers: CORS,
    });
  }

  // 2. Cap the body length sent to the model — Llama 3.1 8B has a context
  // window but we don't need to pay for processing the full body. First
  // 1500 chars captures the lead + most of the nut graf.
  const capped = body.length > 1500 ? body.slice(0, 1500) : body;

  const systemPrompt =
    'You are a news editor. Extract 2 to 4 IMPORTANT phrases or clauses ' +
    'from the given Arabic or English news article body that capture the KEY FACTS ' +
    '(who, what happened, numbers, decisions, consequences). ' +
    'STRICT RULES: ' +
    '(1) Each phrase MUST be copied VERBATIM from the BODY text — exact same ' +
    'characters, same word order, no paraphrasing, no additions, no words from the title. ' +
    '(2) Each phrase is 4 to 20 words long. ' +
    '(3) If the body is very short (1-2 sentences), extract 1-2 key phrases instead of 4. ' +
    '(4) Return ONLY a JSON array of strings, nothing else. ' +
    'Example: ["العبارة الأولى من النص", "العبارة الثانية المهمة"]';

  const userPrompt = `TITLE:\n${title}\n\nBODY:\n${capped}`;

  let raw = '';
  try {
    const res = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 256,
    });
    raw = res?.response || '';
  } catch (e) {
    return Response.json({ ok: false, error: 'ai_run_failed', message: String(e).slice(0, 200), phrases: [] }, {
      status: 502, headers: CORS,
    });
  }

  // 3. Parse JSON array out of the response. The model sometimes wraps it in
  // prose or code fences, so match the first `[...]` substring.
  let phrases = [];
  try {
    const match = raw.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        phrases = parsed
          .filter(p => typeof p === 'string')
          .map(p => p.trim())
          .filter(p => p.length >= 10 && p.length <= 300);
      }
    }
  } catch {}

  // 4. Validate: each phrase MUST exist in the body verbatim.
  const bodyLower = body.toLowerCase();
  phrases = phrases.filter(p => bodyLower.includes(p.toLowerCase()));

  // 5. Dedup + cap at 5
  phrases = [...new Set(phrases)].slice(0, 5);

  // 6. Cache in KV (24h TTL). Even empty results get cached so we don't
  // re-run the model on articles where extraction failed.
  if (feedCache) {
    context.waitUntil(
      feedCache.put(cacheKey, JSON.stringify({ phrases, ts: Date.now() }), { expirationTtl: 86400 })
        .catch(() => {})
    );
  }

  return Response.json({ ok: true, phrases, cached: false }, {
    headers: { ...CORS, 'cache-control': 'public, s-maxage=300' },
  });
}
