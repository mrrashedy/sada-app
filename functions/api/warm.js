// Cloudflare Pages Function — /api/warm
// Dedicated translation-warming endpoint with its own subrequest budget.
// Reads the cached feed, finds non-Arabic items missing from the translation
// index, translates them via Workers AI, and writes the updated index back.
//
// This is invoked by the cron-worker on a separate cadence from /api/feeds
// so it doesn't share the 50-subrequest budget of the aggregation path.

const KV_KEY_FEED = 'feed:latest';
const TRANSLATIONS_INDEX_KEY = 'translations:index';

const M2M_LANG = {
  en: 'english', fr: 'french', de: 'german', es: 'spanish',
  pt: 'portuguese', it: 'italian', ru: 'russian', zh: 'chinese',
  ja: 'japanese', tr: 'turkish', ko: 'korean', hi: 'hindi', nl: 'dutch',
};

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return (h >>> 0).toString(36);
}

function translationHash(item) {
  const sid = item.sourceId || item.source?.id || '?';
  return `${sid}:${hash(item.title || '')}`;
}

async function translateOne(item, ai) {
  const f = {
    title: item.title || '',
    description: item.description ?? item.body ?? '',
    lang: item.lang || 'en',
  };
  // English items never need translation — they're already English.
  if (f.lang === 'en') return null;
  const sourceLang = M2M_LANG[f.lang] || 'English';
  try {
    const prompt = `Translate the following ${sourceLang} news headline and brief into clear, natural English in a professional news-wire style (like Reuters, AP, or the BBC World Service). Keep proper nouns in their standard English forms. Return ONLY the translation, nothing else.

TITLE: ${f.title}${f.description ? `\nBRIEF: ${f.description}` : ''}`;

    const res = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are a professional news translator. You translate headlines and article briefs from world languages into clear, natural English in professional news-wire style. Return only the translated text, no explanations.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 300,
    });

    const raw = (res?.response || '').trim();
    if (!raw) return null;

    // Split title and description from the response
    const lines = raw.split('\n').filter(l => l.trim());
    const t = lines[0] || f.title;
    const d = lines.length > 1 ? lines.slice(1).join(' ').trim() : (f.description || '');

    return { t, d };
  } catch { return null; }
}

export async function onRequest(context) {
  const { request, env } = context;
  const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  const ai = env?.AI || null;
  const feedCache = env?.FEED_CACHE || null;
  const translationKV = env?.TRANSLATIONS || null;

  if (!ai || !feedCache || !translationKV) {
    return new Response(JSON.stringify({ ok: false, error: 'missing bindings' }), { headers: CORS });
  }

  try {
    // 1. Read cached feeds from ALL verticals + existing translation index
    // Each vertical may have non-Arabic items that need translating.
    const FEED_KEYS = ['feed:latest', 'map:latest', 'radar:latest'];
    const [index, ...feedResults] = await Promise.all([
      translationKV.get(TRANSLATIONS_INDEX_KEY, 'json'),
      ...FEED_KEYS.map(k => feedCache.get(k, 'json').catch(() => null)),
    ]);
    const idx = index || {};

    // Merge all non-Arabic items from all verticals
    const allItems = [];
    for (const data of feedResults) {
      if (data?.feed) allItems.push(...data.feed);
    }

    if (allItems.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'no cached feeds — call /api/feeds?refresh=1 first' }), { headers: CORS });
    }

    // 2. Find items needing translation: anything that isn't already Arabic
    // or English. English stays as-is; French/German/etc → English.
    const pending = [];
    for (const item of allItems) {
      if (!item.lang || item.lang === 'ar' || item.lang === 'en') continue;
      const h = translationHash(item);
      if (idx[h]) continue;
      pending.push({ item, h });
      if (pending.length >= 30) break; // stay under subrequest budget (30 AI calls + KV reads)
    }

    if (pending.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'nothing to translate', indexSize: Object.keys(idx).length }), { headers: CORS });
    }

    // 3. Translate — batches of 8 in parallel
    let translated = 0;
    for (let b = 0; b < pending.length; b += 8) {
      const chunk = pending.slice(b, b + 8);
      const results = await Promise.allSettled(chunk.map(({ item }) => translateOne(item, ai)));
      results.forEach((r, j) => {
        if (r.status === 'fulfilled' && r.value) {
          idx[chunk[j].h] = r.value;
          translated++;
        }
      });
    }

    // 4. Write updated index back
    await translationKV.put(TRANSLATIONS_INDEX_KEY, JSON.stringify(idx), { expirationTtl: 604800 });

    return new Response(JSON.stringify({
      ok: true,
      pending: pending.length,
      translated,
      indexSize: Object.keys(idx).length,
    }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e).slice(0, 200) }), { headers: CORS });
  }
}
