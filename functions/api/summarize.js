// Cloudflare Pages Function — /api/summarize
// Generates AI article summaries using Workers AI, caches in Supabase

const SUPABASE_URL = 'https://placeholder.supabase.co'; // Set via env

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }
    });
  }

  try {
    const { articleId, title, body } = await request.json();
    if (!articleId || !title) {
      return Response.json({ ok: false, error: 'Missing articleId or title' }, { status: 400 });
    }

    const ai = env?.AI || null;
    const supabaseUrl = env?.SUPABASE_URL || SUPABASE_URL;
    const supabaseKey = env?.SUPABASE_SERVICE_ROLE_KEY || '';

    // Check cache in Supabase
    if (supabaseUrl && supabaseKey) {
      try {
        const cacheRes = await fetch(`${supabaseUrl}/rest/v1/article_summaries?article_id=eq.${encodeURIComponent(articleId)}&select=summary_ar`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        const cached = await cacheRes.json();
        if (cached?.[0]?.summary_ar) {
          return Response.json({ ok: true, summary: cached[0].summary_ar, cached: true }, {
            headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' }
          });
        }
      } catch {}
    }

    if (!ai) {
      return Response.json({ ok: false, error: 'AI not available' }, {
        status: 503, headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Generate summary
    const text = `${title}\n\n${(body || '').slice(0, 2000)}`;
    const prompt = `أنت محلل إخباري عربي محترف. لخّص هذا الخبر في ٣ جمل واضحة ومركّزة باللغة العربية. التزم بالحياد ولا تضف آراءً شخصية.\n\nالخبر:\n${text}\n\nالملخص:`;

    const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'أنت محلل إخباري عربي. لخّص الأخبار بإيجاز ودقة.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.3,
    });

    const summary = result?.response?.trim() || null;
    if (!summary) {
      return Response.json({ ok: false, error: 'Empty summary' }, {
        status: 500, headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Cache in Supabase
    if (supabaseUrl && supabaseKey) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/article_summaries`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify({ article_id: articleId, summary_ar: summary, model: 'llama-3.1-8b' }),
        });
      } catch {}
    }

    return Response.json({ ok: true, summary, cached: false }, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' }
    });

  } catch (e) {
    return Response.json({ ok: false, error: e.message }, {
      status: 500, headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
}
