/**
 * Depth curation API — Cloudflare Pages Function.
 *
 * GET  /api/depth-curate  → list all docs grouped by source
 * POST /api/depth-curate  → { action: "reject", ids: [1,2,3] }
 *                           { action: "approve", ids: [1,2,3] }
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY from env (set in Cloudflare dashboard).
 * Falls back to the anon key for reads if service key isn't available.
 */

const SUPABASE_URL = 'https://qgfnexfcmiokkkojbqjv.supabase.co';

function getKeys(env) {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
  return { serviceKey, anonKey, readKey: serviceKey || anonKey };
}

export async function onRequestGet(ctx) {
  const { readKey } = getKeys(ctx.env);
  if (!readKey) return new Response('No Supabase key configured', { status: 500 });

  // Fetch all docs with source info
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/depth_feed?select=id,title,source_name,source_slug,category,priority,canonical_url,document_type,analysis_status,analytical_conclusion,published_at,language&order=source_name.asc,published_at.desc`,
    {
      headers: {
        apikey: readKey,
        Authorization: `Bearer ${readKey}`,
      },
    }
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(ctx) {
  const { serviceKey } = getKeys(ctx.env);
  if (!serviceKey) return new Response('No service key', { status: 500 });

  const body = await ctx.request.json();
  const { action, ids } = body;

  if (!action || !Array.isArray(ids) || ids.length === 0) {
    return new Response(JSON.stringify({ error: 'need action + ids[]' }), { status: 400 });
  }

  if (action === 'reject') {
    // Delete rejected docs
    const results = [];
    for (const id of ids) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/depth_documents?id=eq.${id}`, {
        method: 'DELETE',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      });
      results.push({ id, status: r.status });
    }
    return new Response(JSON.stringify({ deleted: results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, action }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
