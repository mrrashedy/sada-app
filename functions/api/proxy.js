// Cloudflare Pages Function — /api/proxy
//
// Self-hosted CORS proxy. ArticleDetail uses this to fetch full article HTML
// when the RSS body is too short. Replaces the old reliance on api.allorigins.win
// and api.codetabs.com (public proxies that rate-limit and go down).
//
// Security:
//   - Only http/https URLs.
//   - Hostname must end in one of ALLOWED_TLDS or match an allowed pattern.
//     Otherwise an attacker could use us as an open proxy to scan internal
//     networks or hit any URL on the internet.
//   - Per-IP rate limit (60/min).
//   - 5MB response cap.
//   - 10s upstream timeout.
//   - Cached at the edge for 5 minutes (cf.cacheTtl).
//
// Usage from client:
//   fetch(`/api/proxy?url=${encodeURIComponent('https://aljazeera.net/article/123')}`)

import { authenticate, corsPreflight, rateLimitKey } from '../_lib/auth.js';
import { limit, tooMany } from '../_lib/ratelimit.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const MAX_BYTES = 5 * 1024 * 1024;       // 5MB
const UPSTREAM_TIMEOUT_MS = 10_000;       // 10s

// Hosts we're willing to proxy to. Anything not matching → 403.
// Use suffix matches so subdomains work (en.wikipedia.org, www.bbc.co.uk).
const ALLOWED_HOST_SUFFIXES = [
  // Arabic broadcasters
  'aljazeera.net', 'aljazeera.com',
  'alarabiya.net',
  'skynewsarabia.com',
  'france24.com', 'france24.tv',
  'dw.com',
  'cnn.com', 'cnnarabic.com',
  'bbc.com', 'bbc.co.uk',
  'rt.com', 'arabic.rt.com',
  'sputnik.com', 'sputniknews.com',
  // Regional
  'alaraby.co.uk', 'alaraby.tv',
  'almasryalyoum.com',
  'arabnews.com',
  'alquds.co.uk', 'alqudsalarabi.com',
  'addustour.com',
  'alriyadh.com',
  'okaz.com.sa',
  'asharqalawsat.com',
  'al-akhbar.com',
  'annahar.com',
  // Translated tier
  'nytimes.com', 'foxnews.com', 'npr.org',
  'theguardian.com', 'washingtonpost.com',
  'bloomberg.com', 'reuters.com', 'apnews.com',
  'haaretz.com', 'timesofisrael.com',
  // Wikipedia (used by some article pages)
  'wikipedia.org', 'wikimedia.org',
];

function hostAllowed(hostname) {
  const lower = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(suffix =>
    lower === suffix || lower.endsWith('.' + suffix),
  );
}

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return Response.json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers: CORS });
  }

  // Anonymous-allowed but rate-limited per IP. (ArticleDetail must work for
  // signed-out users.)
  const auth = await authenticate(context, { allowAnonymous: true });
  if (auth.kind !== 'internal') {
    const rl = await limit(env, `proxy:${rateLimitKey(context, auth)}`, {
      max: 60, windowMs: 60_000,
    });
    if (!rl.ok) return tooMany({ ...rl.headers, ...CORS });
  }

  const url = new URL(request.url).searchParams.get('url');
  if (!url) {
    return Response.json({ ok: false, error: 'missing_url' }, { status: 400, headers: CORS });
  }

  let target;
  try {
    target = new URL(url);
  } catch {
    return Response.json({ ok: false, error: 'invalid_url' }, { status: 400, headers: CORS });
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return Response.json({ ok: false, error: 'invalid_protocol' }, { status: 400, headers: CORS });
  }

  if (!hostAllowed(target.hostname)) {
    return Response.json(
      { ok: false, error: 'host_not_allowed', host: target.hostname },
      { status: 403, headers: CORS },
    );
  }

  // Block obvious internal-network targets even if hostAllowed somehow passed.
  const lower = target.hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower.endsWith('.local') ||
    lower.startsWith('10.') ||
    lower.startsWith('192.168.') ||
    lower.startsWith('127.') ||
    lower.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(lower)
  ) {
    return Response.json({ ok: false, error: 'private_address_blocked' }, { status: 403, headers: CORS });
  }

  // Upstream fetch with timeout
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);

  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      headers: {
        'user-agent': 'Sada/1.0 (+https://101n.app)',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'ar,en;q=0.7',
      },
      signal: ac.signal,
      redirect: 'follow',
      cf: { cacheTtl: 300, cacheEverything: true },
    });
  } catch (e) {
    clearTimeout(timer);
    return Response.json(
      { ok: false, error: e.name === 'AbortError' ? 'upstream_timeout' : 'upstream_failed', detail: e.message },
      { status: 502, headers: CORS },
    );
  }
  clearTimeout(timer);

  // Read with byte cap
  const reader = upstream.body?.getReader();
  if (!reader) {
    return Response.json({ ok: false, error: 'no_body' }, { status: 502, headers: CORS });
  }
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        return Response.json({ ok: false, error: 'too_large', max: MAX_BYTES }, { status: 502, headers: CORS });
      }
      chunks.push(value);
    }
  } catch (e) {
    return Response.json({ ok: false, error: 'read_error', detail: e.message }, { status: 502, headers: CORS });
  }

  const blob = new Blob(chunks);
  const buf = await blob.arrayBuffer();

  return new Response(buf, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'text/html; charset=utf-8',
      'content-length': String(buf.byteLength),
      'cache-control': 'public, max-age=300',
      ...CORS,
    },
  });
}
