// Cloudflare Pages Function — /api/cron
// Called by an external scheduler (Cloudflare Cron Trigger, GitHub Actions, etc.)
// to pre-warm the feed cache so client requests are instant.
//
// Setup: create a Cron Trigger or GitHub Action that hits:
//   POST https://sada-app.pages.dev/api/cron
//   Headers: { Authorization: Bearer <CRON_SECRET> }
//   Every 2 minutes

export async function onRequestPost(context) {
  const { request, env } = context;

  // Auth check — prevent public abuse
  const secret = env?.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const feedCache = env?.FEED_CACHE || null;
  if (!feedCache) {
    return Response.json({ ok: false, error: 'FEED_CACHE KV not bound' }, { status: 503 });
  }

  try {
    // Import the aggregation from feeds endpoint by calling it internally
    const feedUrl = new URL('/api/feeds?refresh&limit=500', request.url);
    const res = await fetch(feedUrl.toString(), {
      headers: { 'User-Agent': 'SadaCron/1.0' },
    });
    const data = await res.json();

    // Also store breaking alerts to Supabase if configured
    const supabaseUrl = env?.SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey && data.breaking?.length > 0) {
      try {
        // Upsert breaking articles to alerts table
        await fetch(`${supabaseUrl}/rest/v1/alerts`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify(data.breaking.slice(0, 10).map(b => ({
            article_id: b.id,
            title: b.title,
            source_name: b.source?.name,
            timestamp: b.timestamp,
            active: true,
          }))),
        });
      } catch {}
    }

    return Response.json({
      ok: true,
      cached: data.count,
      breaking: data.breaking?.length || 0,
      trending: data.trending?.length || 0,
      ts: Date.now(),
    });

  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
