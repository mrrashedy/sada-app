// KV-backed sliding-window rate limiter.
//
// Uses the FEED_CACHE namespace (one less binding to wire up). Each call to
// `limit()` reads the bucket, evicts expired hits, appends the current hit if
// under the limit, and writes the bucket back. KV writes have ~1s eventual
// consistency so the limit is approximate, not strict — it stops abuse, not
// every single excess call. For an exact counter you'd want a Durable Object
// or a Worker with a queue, both overkill for our scale.
//
// Usage:
//   const r = await limit(env, `summarize:${userId}`, { max: 50, windowMs: 86_400_000 });
//   if (!r.ok) return new Response('rate limited', { status: 429, headers: r.headers });

const PREFIX = 'rl:';

export async function limit(env, key, opts = {}) {
  const max = opts.max ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  const kv = env?.FEED_CACHE;

  // No KV → fail open. Don't block users on infra issues.
  if (!kv) return { ok: true, remaining: max, reset: Date.now() + windowMs };

  const fullKey = PREFIX + key;
  const now = Date.now();
  const cutoff = now - windowMs;

  let bucket = [];
  try {
    const raw = await kv.get(fullKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) bucket = parsed.filter(t => t > cutoff);
    }
  } catch {
    // corrupted bucket — start fresh
  }

  if (bucket.length >= max) {
    const oldest = bucket[0];
    const reset = oldest + windowMs;
    return {
      ok: false,
      remaining: 0,
      reset,
      headers: rateLimitHeaders(0, reset, max),
    };
  }

  bucket.push(now);

  // Best-effort write — don't await it on the hot path beyond the put call.
  // KV TTL ensures we don't leak buckets indefinitely.
  try {
    await kv.put(fullKey, JSON.stringify(bucket), {
      expirationTtl: Math.max(60, Math.ceil(windowMs / 1000) + 60),
    });
  } catch {
    // Write failed — already counted in this request, fall through.
  }

  const remaining = max - bucket.length;
  const reset = bucket[0] + windowMs;
  return {
    ok: true,
    remaining,
    reset,
    headers: rateLimitHeaders(remaining, reset, max),
  };
}

function rateLimitHeaders(remaining, reset, limit) {
  return {
    'x-ratelimit-limit': String(limit),
    'x-ratelimit-remaining': String(remaining),
    'x-ratelimit-reset': String(Math.ceil(reset / 1000)),
  };
}

export function tooMany(headers = {}) {
  return new Response(
    JSON.stringify({ ok: false, error: 'rate_limited', message: 'تجاوزت الحد المسموح. حاول لاحقاً.' }),
    {
      status: 429,
      headers: { 'content-type': 'application/json', ...headers },
    },
  );
}
