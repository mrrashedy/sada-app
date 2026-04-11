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
  const sourceLang = M2M_LANG[f.lang] || 'english';
  try {
    const titleRes = await ai.run('@cf/meta/m2m100-1.2b', { text: f.title, source_lang: sourceLang, target_lang: 'arabic' });
    const t = titleRes?.translated_text || f.title;
    let d = f.description;
    if (d) {
      try {
        const descRes = await ai.run('@cf/meta/m2m100-1.2b', { text: d, source_lang: sourceLang, target_lang: 'arabic' });
        d = descRes?.translated_text || d;
      } catch {}
    }
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
    // 1. Read cached feed + existing translation index
    const [data, index] = await Promise.all([
      feedCache.get(KV_KEY_FEED, 'json'),
      translationKV.get(TRANSLATIONS_INDEX_KEY, 'json'),
    ]);
    const idx = index || {};

    if (!data?.feed) {
      return new Response(JSON.stringify({ ok: false, error: 'no cached feed — call /api/feeds?refresh=1 first' }), { headers: CORS });
    }

    // 2. Find non-Arabic items missing from the index
    const pending = [];
    for (const item of data.feed) {
      if (!item.lang || item.lang === 'ar') continue;
      const h = translationHash(item);
      if (idx[h]) continue;
      pending.push({ item, h });
      if (pending.length >= 40) break; // stay under ~45 subrequests total
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
