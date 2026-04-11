// Cloudflare Pages Function — /api/feed-since
//
// Incremental feed update. The full /api/feeds payload is ~200 items and ~250KB
// gzipped. Pull-to-refresh doesn't need that — it just needs the items that
// landed since the last call. This endpoint reads the warm KV cache (never
// triggers re-aggregation) and returns only the delta.
//
//   GET /api/feed-since?since=1734567890000
//
// Response:
//   {
//     ok: true,
//     items: [...],     // only items with timestamp > since
//     newest: 1734567899000,  // max timestamp in cache (use as next `since`)
//     count: 5,
//     _cache: { age, aggregatedAt }
//   }
//
// Sorted newest first. Capped at `limit` (default 50).

const KV_KEY_FEED = 'feed:latest';
const KV_KEY_META = 'feed:meta';

const CORS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
};

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const sinceRaw = url.searchParams.get('since');
  const since = sinceRaw === null ? null : Number(sinceRaw);
  if (since !== null && (!Number.isFinite(since) || since < 0)) {
    return Response.json(
      { ok: false, error: 'invalid_since', hint: 'pass a positive Unix ms timestamp' },
      { status: 400, headers: CORS },
    );
  }

  const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '50', 10)));

  const feedCache = env?.FEED_CACHE;
  if (!feedCache) {
    return Response.json(
      { ok: false, error: 'cache_unbound' },
      { status: 503, headers: CORS },
    );
  }

  const [cached, meta] = await Promise.all([
    feedCache.get(KV_KEY_FEED, 'json'),
    feedCache.get(KV_KEY_META, 'json'),
  ]);

  if (!cached?.feed?.length) {
    return Response.json(
      { ok: false, error: 'cache_empty', hint: 'GET /api/feeds first to warm the cache' },
      { status: 503, headers: CORS },
    );
  }

  // Compute newest timestamp regardless of filter (so client can update its
  // `since` even when the delta is empty).
  let newest = 0;
  for (const item of cached.feed) {
    if (item.timestamp > newest) newest = item.timestamp;
  }

  // Filter + sort newest first.
  const filtered = (since === null
    ? cached.feed
    : cached.feed.filter(it => it.timestamp > since)
  )
    .slice() // don't mutate the cached array
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, limit);

  const ageMs = meta?.ts ? Date.now() - meta.ts : null;

  return new Response(
    JSON.stringify({
      ok: true,
      count: filtered.length,
      newest,
      items: filtered,
      _cache: {
        age: ageMs !== null ? Math.floor(ageMs / 1000) : null,
        aggregatedAt: meta?.ts || null,
      },
    }),
    {
      headers: {
        ...CORS,
        // Short s-maxage so polling clients can be aggressive but the edge
        // still absorbs bursts.
        'cache-control': 'public, s-maxage=10, stale-while-revalidate=30',
      },
    },
  );
}
