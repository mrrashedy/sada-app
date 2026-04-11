// POST /api/cluster
// Body: { topics: ["إيران", "الأمريكية", "الولايات المتحدة", ...] }
// Returns: { groups: [["الأمريكية", "الولايات المتحدة"], ["إيران"], ...] }
//
// Uses Workers AI (Llama 3.1 8B) to group news topics that refer to the
// same real-world entity. Caches results in FEED_CACHE KV by topic-set hash
// for 5 minutes so we don't pay AI cost on every radar refresh.
//
// AUTH: open to anonymous (radar must work without sign-in) but rate limited
// per-IP to stop AI quota abuse.

import { authenticate, rateLimitKey, corsPreflight } from '../_lib/auth.js';
import { limit, tooMany } from '../_lib/ratelimit.js';

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Per-caller rate limit. Anonymous → IP, signed-in → user, internal → unlimited.
  const auth = await authenticate(context, { allowAnonymous: true });
  if (auth.kind !== 'internal') {
    const rl = await limit(env, `cluster:${rateLimitKey(context, auth)}`, {
      max: 30, windowMs: 60_000,
    });
    if (!rl.ok) return tooMany(rl.headers);
  }

  let topics;
  try {
    const body = await request.json();
    topics = body.topics;
  } catch {
    return Response.json({ groups: [] }, { status: 400 });
  }

  if (!Array.isArray(topics) || topics.length === 0) {
    return Response.json({ groups: [] });
  }

  // Fingerprint by sorted topic set so identical inputs hit cache.
  // Bump version suffix when prompt or response shape changes.
  const fingerprint = topics.slice().sort().join('|');
  const cacheKey = 'cluster:v2:' + (await sha256(fingerprint));

  if (env.FEED_CACHE) {
    try {
      const cached = await env.FEED_CACHE.get(cacheKey);
      if (cached) return Response.json(JSON.parse(cached));
    } catch {}
  }

  if (!env.AI) {
    // No AI binding — fallback to singletons
    return Response.json({ groups: topics.map(t => [t]) });
  }

  const numbered = topics.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const userPrompt = `اجمع وصنف هذه المواضيع الإخبارية العربية.

المواضيع:
${numbered}

قواعد التجميع:
- اسم الجنسية يُجمع مع اسم الدولة (الأمريكية مع الولايات المتحدة، الإيرانية مع إيران)
- جميع تسميات نفس الكيان تُجمع معاً
- كل موضوع يظهر في مجموعة واحدة فقط، استخدم رقمه

التصنيف لكل مجموعة (اختر واحداً فقط):
- "person": شخص (رئيس، وزير، قائد، أي إنسان مُسمّى مثل ترامب، بوتين، نتنياهو)
- "country": دولة، مدينة، أو منطقة جغرافية (إيران، الولايات المتحدة، غزة، لبنان)
- "org": منظمة، حزب، أو حركة (الأمم المتحدة، حماس، حزب الله، الناتو)
- "event": حدث أو ظاهرة عامة (حرب، السلام، الزلزال، إطلاق النار)
- "other": أي شيء آخر

أعد JSON فقط، بدون أي شرح:
{"groups":[{"topics":[1,2],"type":"country"},{"topics":[3],"type":"person"}]}`;

  try {
    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You output only valid JSON. No explanations, no markdown, no commentary.' },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 400
    });

    const text = (aiResponse && aiResponse.response) || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON in AI response');

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.groups)) throw new Error('groups not an array');

    const VALID_TYPES = new Set(['person', 'country', 'org', 'event', 'other']);

    // Map indices back to topic strings; accept either { topics, type } or bare arrays
    const groups = parsed.groups
      .map(g => {
        if (Array.isArray(g)) {
          // legacy bare-array form
          return { topics: g.map(i => topics[Number(i) - 1]).filter(Boolean), type: 'other' };
        }
        if (g && Array.isArray(g.topics)) {
          return {
            topics: g.topics.map(i => topics[Number(i) - 1]).filter(Boolean),
            type: VALID_TYPES.has(g.type) ? g.type : 'other',
          };
        }
        return { topics: [], type: 'other' };
      })
      .filter(g => g.topics.length > 0);

    // Ensure every topic appears exactly once: add singletons for any missed
    const seen = new Set();
    groups.forEach(g => g.topics.forEach(t => seen.add(t)));
    topics.forEach(t => { if (!seen.has(t)) groups.push({ topics: [t], type: 'other' }); });

    // Dedupe within groups
    const cleanGroups = groups.map(g => ({ topics: Array.from(new Set(g.topics)), type: g.type }));

    const result = { groups: cleanGroups };

    if (env.FEED_CACHE) {
      try {
        await env.FEED_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 });
      } catch {}
    }

    return Response.json(result);
  } catch (err) {
    // Fallback: each topic is its own group, untyped
    return Response.json({
      groups: topics.map(t => ({ topics: [t], type: 'other' })),
      error: String(err && err.message || err),
    });
  }
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
