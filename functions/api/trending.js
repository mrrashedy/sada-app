// Cloudflare Pages Function — /api/trending
// Returns server-computed trending topics from the cached feed
// Falls back to computing from live feed if no cache
// Layered with `radar_overrides` from Supabase (pin / hide / add custom topics)

async function fetchRadarOverrides(env) {
  const url = env?.SUPABASE_URL;
  const key = env?.SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const r = await fetch(`${url}/rest/v1/radar_overrides?select=*`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      cf: { cacheTtl: 10, cacheEverything: true },
    });
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }

  const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, s-maxage=60' };
  const feedCache = env?.FEED_CACHE || null;

  try {
    // Read from KV cache + radar overrides in parallel
    const overridesPromise = fetchRadarOverrides(env);
    let feed = null;
    if (feedCache) {
      const cached = await feedCache.get('feed:latest', 'json');
      if (cached) feed = cached.feed;
    }

    const overrides = await overridesPromise;
    const now0 = Date.now();
    // Drop expired overrides
    const liveOverrides = overrides.filter(o => !o.expires_at || new Date(o.expires_at).getTime() > now0);
    const hiddenWords = new Set(liveOverrides.filter(o => o.action === 'hide').map(o => o.word));
    const pinnedOverrides = liveOverrides.filter(o => o.action === 'pin');
    const addedOverrides = liveOverrides.filter(o => o.action === 'add');

    if (!feed) {
      // Even without feed cache, return manual additions / pinned items so the radar still works
      const trending = [
        ...pinnedOverrides.map(o => ({ tag: o.word, score: o.weight || 5, count: o.weight || 5, pinned: true })),
        ...addedOverrides.map(o => ({ tag: o.word, score: o.weight || 5, count: o.weight || 5, manual: true })),
      ];
      return Response.json({ ok: true, trending, topics: [], reason: 'no_cache' }, { headers: CORS });
    }

    const now = Date.now();
    const SIX_HOURS = 6 * 3600000;

    // ── Trending tags (weighted by recency) ──
    const tagScores = {};
    feed.forEach(f => {
      const age = now - (f.timestamp || 0);
      const recencyBoost = age < SIX_HOURS ? 2 : age < 12 * 3600000 ? 1.2 : 1;
      const breakingBoost = f.isBreaking ? 1.5 : 1;
      (f.categories || []).forEach(c => {
        if (c !== 'عاجل' && c.length > 1 && c.length < 25 && !hiddenWords.has(c)) {
          tagScores[c] = (tagScores[c] || 0) + (1 * recencyBoost * breakingBoost);
        }
      });
    });

    // Build trending: pinned topics force-included at top, then organic, then manual adds
    const pinnedSet = new Set(pinnedOverrides.map(o => o.word));
    const organic = Object.entries(tagScores)
      .filter(([tag]) => !pinnedSet.has(tag))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([tag, score]) => ({ tag, score: Math.round(score * 10) / 10, count: Math.round(score) }));

    // Pinned topics always at front. Use organic score if present, else override weight.
    const pinned = pinnedOverrides.map(o => {
      const live = tagScores[o.word] || 0;
      const score = live > 0 ? live : (o.weight || 5);
      return { tag: o.word, score: Math.round(score * 10) / 10, count: Math.round(score), pinned: true };
    });

    // Manual "add" topics (not in organic feed)
    const organicSet = new Set(organic.map(t => t.tag));
    const added = addedOverrides
      .filter(o => !organicSet.has(o.word) && !pinnedSet.has(o.word))
      .map(o => ({ tag: o.word, score: o.weight || 5, count: o.weight || 5, manual: true }));

    const trending = [...pinned, ...organic, ...added].slice(0, 40);

    // ── Topic clusters (group articles sharing 2+ tags) ──
    const topicMap = {};
    feed.slice(0, 200).forEach(f => {
      const tags = (f.categories || []).filter(c => c !== 'عاجل');
      if (tags.length === 0) return;
      const key = tags.slice(0, 2).sort().join('|');
      if (!topicMap[key]) topicMap[key] = { tags: tags.slice(0, 3), articles: [], score: 0 };
      topicMap[key].articles.push({ id: f.id, title: f.title, source: f.source?.name, ts: f.timestamp });
      topicMap[key].score += f.isBreaking ? 3 : 1;
    });
    const topics = Object.values(topicMap)
      .filter(t => t.articles.length >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map(t => ({ tags: t.tags, count: t.articles.length, score: t.score, articles: t.articles.slice(0, 5) }));

    // ── Source activity (which sources are publishing most) ──
    const sourceActivity = {};
    feed.filter(f => (now - (f.timestamp || 0)) < SIX_HOURS).forEach(f => {
      const name = f.source?.name;
      if (name) sourceActivity[name] = (sourceActivity[name] || 0) + 1;
    });
    const activeSources = Object.entries(sourceActivity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return Response.json({ ok: true, trending, topics, activeSources, feedSize: feed.length }, { headers: CORS });

  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500, headers: CORS });
  }
}
