// Cloudflare Pages Function — /api/health
//
// Liveness + readiness probe. Hit this from uptime monitoring (Cloudflare
// Health Checks, UptimeRobot, BetterStack, etc.) to know if the app is up
// AND its dependencies are reachable.
//
//   GET /api/health           — fast liveness, no dependency checks (~1ms)
//   GET /api/health?deep=1    — also pings KV + Supabase + Workers AI
//
// Returns 200 if everything is OK, 503 if any dependency is unreachable.
// Body:
//   { ok, version, ts, env, services: { kv, supabase, ai } }

const CORS = { 'access-control-allow-origin': '*' };

const VERSION = '1.0.0';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const deep = url.searchParams.get('deep') === '1';

  const result = {
    ok: true,
    version: VERSION,
    ts: Date.now(),
    env: env?.ENVIRONMENT || (env?.SUPABASE_URL?.includes('staging') ? 'staging' : 'production'),
  };

  if (!deep) {
    return Response.json(result, { headers: { ...CORS, 'cache-control': 'no-store' } });
  }

  // ── Deep health check ──
  const services = {
    kv: 'unknown',
    supabase: 'unknown',
    ai: 'unknown',
    cache_age_ms: null,
  };

  // KV: read the warm feed cache. If it's there, also report its age.
  if (env?.FEED_CACHE) {
    try {
      const meta = await env.FEED_CACHE.get('feed:meta', 'json');
      if (meta?.ts) {
        services.kv = 'ok';
        services.cache_age_ms = Date.now() - meta.ts;
      } else {
        // KV is bound but warm cache missing — degraded but not down.
        services.kv = 'cold';
      }
    } catch (e) {
      services.kv = `error:${e.message}`;
      result.ok = false;
    }
  } else {
    services.kv = 'unbound';
    result.ok = false;
  }

  // Supabase: probe a known public-read table. The REST root (/rest/v1/) is
  // not unauthenticated — it returns 401 even with valid keys — so we hit
  // a real table that exists in every install.
  if (env?.SUPABASE_URL && env?.SUPABASE_ANON_KEY) {
    try {
      const sbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/comments?select=id&limit=1`, {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        },
        signal: AbortSignal.timeout(3000),
      });
      services.supabase = sbRes.ok ? 'ok' : `status:${sbRes.status}`;
      if (!sbRes.ok) result.ok = false;
    } catch (e) {
      services.supabase = `error:${e.message}`;
      result.ok = false;
    }
  } else {
    services.supabase = 'unbound';
    result.ok = false;
  }

  // Workers AI: just check that the binding exists. Actually running an
  // inference for a healthcheck would burn quota.
  services.ai = env?.AI ? 'bound' : 'unbound';
  if (!env?.AI) result.ok = false;

  result.services = services;

  return Response.json(result, {
    status: result.ok ? 200 : 503,
    headers: { ...CORS, 'cache-control': 'no-store' },
  });
}
