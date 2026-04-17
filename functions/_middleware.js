// Cloudflare Pages middleware — runs on every request, including static assets.
//
// Three jobs:
//
//  1. Preview password gate (temporary lock).
//     The site is in private preview. Any non-/api/* request must present a
//     valid session cookie or it's served the login page. To remove the gate,
//     delete the GATE block below (marked with ── GATE ──) and the helper
//     functions `parseCookies`, `isGateAuthed`, `handleGateLogin`, and
//     `gateLoginPage`.
//
//  2. Open Graph injection for shared article URLs.
//     When someone shares `https://101n.app/?article=ID` on WhatsApp/Twitter,
//     the social crawler fetches the URL and reads og:* meta tags. The React
//     SPA shell has only generic tags, so the preview is blank. We rewrite
//     the index.html response on the fly to inject article-specific tags.
//
//     The article is looked up from the FEED_CACHE KV (already kept hot by
//     the cron-worker), so this adds <5ms to the request.
//
//  3. Security headers on all responses (defense-in-depth).
//
// OG injection + security headers short-circuit cleanly if FEED_CACHE isn't
// bound or the response isn't HTML.

// ── Preview password gate ───────────────────────────────────────────
// Temporary lock — change the password here or remove this whole block
// to make the site public.
const GATE_PASSWORD       = 'newsroom700';
const GATE_COOKIE_NAME    = 'sada_gate';
// Opaque cookie value. Changing this invalidates all existing sessions.
const GATE_COOKIE_TOKEN   = 'nr700-ok-v1';
const GATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const SECURITY_HEADERS = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=(), camera=(), microphone=(), interest-cohort=()',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
};

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // ── GATE ─────────────────────────────────────────────────────────
  // /api/* is intentionally exempt so scheduler bots, cron workers, and
  // integrations keep working. Everything else requires the cookie.
  // Allow static assets (fonts, images, JS bundles, manifest, etc.)
  // through the gate UNCONDITIONALLY. Without this, the password-gate
  // HTML response replaces the asset bytes — fonts fail to load and
  // browsers fall back to system Arabic, the manifest 404s, the PWA
  // service worker can't register, etc. Detection is by extension:
  // anything with a real file extension that ISN'T .html is an asset.
  const isStaticAsset = /\.(?:ttf|otf|woff2?|eot|png|jpe?g|gif|svg|webp|ico|css|js|mjs|map|json|txt|xml|webmanifest|mp3|mp4|wav|ogg|woff|m4a)$/i.test(url.pathname);

  if (!url.pathname.startsWith('/api/') && !isStaticAsset) {
    if (url.pathname === '/gate-login') {
      return handleGateLogin(request);
    }
    if (!isGateAuthed(request)) {
      return new Response(gateLoginPage(), {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store, no-cache, must-revalidate',
          ...SECURITY_HEADERS,
        },
      });
    }
  }

  // Pass /api/* through untouched — those endpoints set their own headers.
  if (url.pathname.startsWith('/api/')) {
    return next();
  }

  const response = await next();

  // Only operate on HTML responses (the SPA shell)
  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('text/html')) {
    return applySecurityHeaders(response);
  }

  const articleId = url.searchParams.get('article');

  // Plain navigation, no article = just security headers
  if (!articleId || !env?.FEED_CACHE) {
    return applySecurityHeaders(response);
  }

  // Look up the article in the warm KV cache
  let article = null;
  try {
    const cached = await env.FEED_CACHE.get('feed:latest', 'json');
    article = cached?.feed?.find(a => a.id === articleId);
  } catch {
    // KV miss is fine — we'll just serve the SPA shell as-is
  }

  if (!article) {
    return applySecurityHeaders(response);
  }

  const html = await response.text();
  const rewritten = injectOgTags(html, article, url.toString());

  return applySecurityHeaders(
    new Response(rewritten, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }),
  );
}

function injectOgTags(html, article, fullUrl) {
  const title = escapeHtml(article.title || 'غرفة الأخبار');
  const desc = escapeHtml(
    (article.description || article.summary || '').replace(/<[^>]+>/g, '').slice(0, 200),
  );
  const image = escapeHtml(article.image || article.thumbnail || 'https://101n.app/og-default.png');
  const sourceName = escapeHtml(article.source?.name || 'غرفة الأخبار');
  const articleUrl = escapeHtml(fullUrl);

  const meta = `
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="${image}">
    <meta property="og:url" content="${articleUrl}">
    <meta property="og:type" content="article">
    <meta property="og:locale" content="ar_AR">
    <meta property="og:site_name" content="غرفة الأخبار">
    <meta property="article:author" content="${sourceName}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${desc}">
    <meta name="twitter:image" content="${image}">
    <link rel="canonical" href="${articleUrl}">
  `;

  // Strip any existing og:* tags (the SPA's defaults) before injecting,
  // otherwise crawlers may pick the wrong one.
  const cleaned = html
    .replace(/<meta[^>]+(?:property|name)=["'](?:og:|twitter:|article:)[^>]*>\s*/gi, '')
    .replace('</head>', meta + '\n</head>');

  return cleaned;
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ── Preview password gate helpers ────────────────────────────────────
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function isGateAuthed(request) {
  const cookies = parseCookies(request.headers.get('cookie'));
  return cookies[GATE_COOKIE_NAME] === GATE_COOKIE_TOKEN;
}

async function handleGateLogin(request) {
  // GET → show the form
  if (request.method !== 'POST') {
    return new Response(gateLoginPage(), {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
        ...SECURITY_HEADERS,
      },
    });
  }

  // POST → verify password
  let password = '';
  try {
    const form = await request.formData();
    password = String(form.get('password') || '');
  } catch {
    // Malformed body — fall through to error
  }

  if (password !== GATE_PASSWORD) {
    return new Response(gateLoginPage({ error: 'كلمة المرور غير صحيحة' }), {
      status: 401,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
        ...SECURITY_HEADERS,
      },
    });
  }

  // Success → set cookie and redirect to root
  const headers = new Headers({
    'location': '/',
    'set-cookie': `${GATE_COOKIE_NAME}=${GATE_COOKIE_TOKEN}; Path=/; Max-Age=${GATE_COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
    'cache-control': 'no-store, no-cache, must-revalidate',
  });
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(null, { status: 302, headers });
}

function gateLoginPage({ error = '' } = {}) {
  const errBlock = error ? `<p class="err">${escapeHtml(error)}</p>` : '';
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="theme-color" content="#0a0a0a">
<title>صدى</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  html, body {
    min-height: 100vh;
    background: radial-gradient(ellipse at center, #0f0f0f 0%, #050505 100%);
    color: #f0f0f0;
    font-family: 'Tajawal', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    direction: rtl;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    background: #111;
    border: 1px solid #1f1f1f;
    padding: 38px 30px 28px;
    border-radius: 14px;
    width: min(92vw, 340px);
    text-align: center;
    box-shadow: 0 24px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.02) inset;
  }
  h1 {
    font-size: 38px;
    font-weight: 900;
    letter-spacing: -1.5px;
    line-height: 1;
    margin-bottom: 4px;
    color: #fff;
  }
  .sub {
    font-size: 12px;
    font-weight: 500;
    color: #888;
    margin-bottom: 28px;
    letter-spacing: 0.2px;
  }
  input[type="password"] {
    width: 100%;
    padding: 15px 16px;
    font-size: 15px;
    font-family: inherit;
    font-weight: 500;
    background: #181818;
    border: 1px solid #262626;
    border-radius: 9px;
    color: #fff;
    text-align: center;
    outline: none;
    margin-bottom: 10px;
    letter-spacing: 4px;
    transition: border-color 0.15s, background 0.15s;
  }
  input[type="password"]:focus {
    border-color: #3a3a3a;
    background: #1c1c1c;
  }
  input::placeholder { color: #444; letter-spacing: 6px; }
  button {
    width: 100%;
    padding: 14px;
    font-size: 14px;
    font-weight: 700;
    font-family: inherit;
    background: #f0f0f0;
    color: #000;
    border: none;
    border-radius: 9px;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: background 0.15s, transform 0.05s;
  }
  button:hover { background: #fff; }
  button:active { transform: scale(0.985); }
  .err {
    color: #ff5c5c;
    font-size: 12px;
    font-weight: 500;
    margin-bottom: 10px;
    min-height: 16px;
  }
  .foot {
    margin-top: 22px;
    font-size: 10px;
    color: #444;
    letter-spacing: 1.5px;
    font-weight: 500;
  }
  .dot { display: inline-block; width: 4px; height: 4px; background: #444; border-radius: 50%; margin: 0 6px; vertical-align: middle; }
</style>
</head>
<body>
  <form class="card" method="POST" action="/gate-login" autocomplete="off">
    <h1>صدى</h1>
    <div class="sub">معاينة خاصة — الوصول محدود</div>
    ${errBlock}
    <input
      type="password"
      name="password"
      placeholder="••••••"
      autofocus
      autocomplete="current-password"
      required
    />
    <button type="submit">دخول</button>
    <div class="foot">SADA <span class="dot"></span> PRIVATE PREVIEW</div>
  </form>
</body>
</html>`;
}
