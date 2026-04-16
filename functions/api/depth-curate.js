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

  // Maintenance action: scan every analyzed doc, find ones whose
  // conclusion came back in the wrong language (Arabic source →
  // English conclusion or vice versa), drop those analyses and flip
  // the docs back to 'pending'. The next worker run re-analyzes them
  // with the current language-aware prompt. No ids[] required.
  if (action === 'requeue_language_mismatches') {
    const AR_RE = /[\u0600-\u06FF]/;
    // PostgREST embedded join: pull every doc + its analysis (if any)
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/depth_documents?select=id,language,depth_analyses(analytical_conclusion)&limit=10000`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!r.ok) {
      return new Response(JSON.stringify({ error: 'fetch failed', status: r.status }), { status: 500 });
    }
    const rows = await r.json();
    const mismatched = [];
    for (const row of rows) {
      const lang = String(row.language || '').toLowerCase();
      const a = Array.isArray(row.depth_analyses) ? row.depth_analyses[0] : row.depth_analyses;
      const concl = a && a.analytical_conclusion;
      if (!concl) continue;
      const hasArabic = AR_RE.test(concl);
      const isAr = lang.startsWith('ar');
      const isEn = lang.startsWith('en');
      if ((isAr && !hasArabic) || (isEn && hasArabic)) mismatched.push(row.id);
    }
    if (mismatched.length === 0) {
      return new Response(JSON.stringify({ requeued: 0, message: 'no mismatches found' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Chunked DELETE + UPDATE — PostgREST's `in.()` filter has a URL length cap.
    const CHUNK = 50;
    let deleted = 0;
    let updated = 0;
    for (let i = 0; i < mismatched.length; i += CHUNK) {
      const batch = mismatched.slice(i, i + CHUNK);
      const idList = batch.join(',');
      const dr = await fetch(`${SUPABASE_URL}/rest/v1/depth_analyses?document_id=in.(${idList})`, {
        method: 'DELETE',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (dr.ok) deleted += batch.length;
      const ur = await fetch(`${SUPABASE_URL}/rest/v1/depth_documents?id=in.(${idList})`, {
        method: 'PATCH',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ analysis_status: 'pending' }),
      });
      if (ur.ok) updated += batch.length;
    }
    return new Response(JSON.stringify({
      requeued: mismatched.length,
      deleted_analyses: deleted,
      flipped_pending: updated,
      sample_ids: mismatched.slice(0, 10),
    }), { headers: { 'Content-Type': 'application/json' } });
  }

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
