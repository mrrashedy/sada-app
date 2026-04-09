// Cloudflare Pages Function — /api/trending
// Returns server-computed trending topics from the cached feed
// Falls back to computing from live feed if no cache

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
    // Read from KV cache
    let feed = null;
    if (feedCache) {
      const cached = await feedCache.get('feed:latest', 'json');
      if (cached) feed = cached.feed;
    }

    if (!feed) {
      return Response.json({ ok: true, trending: [], topics: [], reason: 'no_cache' }, { headers: CORS });
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
        if (c !== 'عاجل' && c.length > 1 && c.length < 25) {
          tagScores[c] = (tagScores[c] || 0) + (1 * recencyBoost * breakingBoost);
        }
      });
    });
    const trending = Object.entries(tagScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([tag, score]) => ({ tag, score: Math.round(score * 10) / 10, count: Math.round(score) }));

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
