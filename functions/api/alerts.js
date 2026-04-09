// Cloudflare Pages Function — /api/alerts
// Returns active breaking news alerts
// GET: fetch recent alerts
// POST: acknowledge/dismiss an alert (requires auth)

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' },
    });
  }

  const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const feedCache = env?.FEED_CACHE || null;

  try {
    if (request.method === 'GET') {
      // Return breaking articles from cached feed
      let breaking = [];

      if (feedCache) {
        const cached = await feedCache.get('feed:latest', 'json');
        if (cached?.breaking) breaking = cached.breaking;
      }

      // Also check if there's a last-seen timestamp
      const url = new URL(request.url);
      const since = parseInt(url.searchParams.get('since')) || 0;

      if (since > 0) {
        breaking = breaking.filter(b => (b.timestamp || 0) > since);
      }

      return Response.json({
        ok: true,
        alerts: breaking.slice(0, 10).map(b => ({
          id: b.id,
          title: b.title,
          source: b.source?.name,
          timestamp: b.timestamp,
          link: b.link,
        })),
        count: breaking.length,
      }, { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=15' } });
    }

    // POST: push a manual alert (admin only)
    if (request.method === 'POST') {
      const secret = env?.CRON_SECRET;
      const auth = request.headers.get('Authorization');
      if (!secret || auth !== `Bearer ${secret}`) {
        return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: CORS });
      }

      const { title, body, source, link } = await request.json();
      if (!title) {
        return Response.json({ ok: false, error: 'Missing title' }, { status: 400, headers: CORS });
      }

      // Store in Supabase alerts table if configured
      const supabaseUrl = env?.SUPABASE_URL;
      const supabaseKey = env?.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && supabaseKey) {
        await fetch(`${supabaseUrl}/rest/v1/alerts`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            article_id: `manual-${Date.now()}`,
            title,
            body: body || null,
            source_name: source || 'صَدى',
            timestamp: Date.now(),
            active: true,
            manual: true,
          }),
        });
      }

      return Response.json({ ok: true, pushed: true }, { headers: CORS });
    }

    return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405, headers: CORS });

  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500, headers: CORS });
  }
}
