// Shared auth helpers for Pages Functions.
//
// Two trust modes:
//
//   1. Internal — server-to-server calls from cron-worker or middleware.
//      Sender includes header `x-internal-key: <INTERNAL_API_KEY>`.
//      Used by /api/cron, /api/comments → /api/moderate, etc.
//
//   2. User — calls from authenticated end users.
//      Sender includes header `Authorization: Bearer <supabase-jwt>`.
//      We verify the JWT signature against Supabase's JWKS endpoint.
//      Used by /api/summarize, /api/comments.
//
// `requireAuth(context)` returns one of:
//   { kind: 'internal' }
//   { kind: 'user', userId: '<uuid>' }
//   { kind: 'none', response: <401 Response> }   ← caller should `return response`

const JSON_HEADERS = { 'content-type': 'application/json' };

export function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers || {}) },
  });
}

export function unauthorized(reason = 'unauthorized') {
  return jsonResponse({ ok: false, error: reason }, { status: 401 });
}

// Verify a Supabase JWT by hitting the GoTrue /user endpoint.
// This is the simplest reliable verification — Supabase signs the token, we
// ask Supabase to confirm it. Cached briefly per-request via context-bound Map.
export async function verifySupabaseJwt(env, jwt) {
  if (!jwt) return null;
  if (!env?.SUPABASE_URL || !env?.SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${jwt}`,
      },
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user?.id) return null;
    return { id: user.id, email: user.email || null };
  } catch {
    return null;
  }
}

// Pick the auth mode for an incoming request.
//   options.allowAnonymous (default false) — if true, returns { kind:'anon' }
//     when neither key nor JWT is present, instead of unauthorized.
export async function authenticate(context, options = {}) {
  const { request, env } = context;
  const internalHeader = request.headers.get('x-internal-key');
  if (internalHeader && env?.INTERNAL_API_KEY && internalHeader === env.INTERNAL_API_KEY) {
    return { kind: 'internal' };
  }

  const authHeader = request.headers.get('authorization') || '';
  const jwtMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (jwtMatch) {
    const user = await verifySupabaseJwt(env, jwtMatch[1]);
    if (user) return { kind: 'user', userId: user.id, email: user.email };
  }

  if (options.allowAnonymous) return { kind: 'anon' };
  return { kind: 'none', response: unauthorized() };
}

// Convenience: extract a stable rate-limit key for the caller.
//  - internal: caller is trusted, no key (or 'internal')
//  - user:     userId
//  - anon:     IP from CF-Connecting-IP
export function rateLimitKey(context, auth) {
  if (auth.kind === 'internal') return 'internal';
  if (auth.kind === 'user') return `u:${auth.userId}`;
  const ip =
    context.request.headers.get('cf-connecting-ip') ||
    context.request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown';
  return `ip:${ip}`;
}

// Standard CORS preflight response — most endpoints share this.
export function corsPreflight(extraHeaders = {}) {
  return new Response(null, {
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'authorization,content-type,x-internal-key',
      'access-control-max-age': '86400',
      ...extraHeaders,
    },
  });
}

export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
};
