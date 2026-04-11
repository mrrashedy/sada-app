# Launch Plan — صَدى / غرفة الأخبار
**Target:** 101n.app live, public, stable, and legally compliant.

Work the phases in order. Don't skip Phase 1 — those items will break or embarrass you on day 1.

---

## Phase 0 — Pre-flight (do first, takes 1 hour)

- [ ] **0.1** Create Sentry account at sentry.io → new React project → save DSN
- [ ] **0.2** Cloudflare Pages: add `staging` branch as preview alias → push to `staging` deploys to staging URL
- [ ] **0.3** Generate launch secrets:
  ```bash
  openssl rand -hex 32  # → INTERNAL_API_KEY
  ```
  Add to Cloudflare Pages env vars (production + preview)
  Add to cron-worker: `wrangler secret put INTERNAL_API_KEY` (in `cron-worker/`)

---

## Phase 1 — Critical (block launch if missing)

### 1.1 Lock down AI endpoints
**Risk:** Anyone can hit `/api/cluster|summarize|moderate` and burn Workers AI quota.
**Files:** `functions/api/cluster.js`, `functions/api/summarize.js`, `functions/api/moderate.js`

Add at top of each handler:
```js
const key = context.request.headers.get('x-internal-key');
if (key !== context.env.INTERNAL_API_KEY) {
  return new Response('Unauthorized', { status: 401 });
}
```

For client-initiated summarize calls (Article Detail), proxy through a new endpoint that injects the header server-side. For cron/cluster, only call from `cron-worker/index.js` which already has the secret.

**Done when:** `curl https://101n.app/api/cluster` returns 401.

### 1.2 Rate limit /api/feeds
**Where:** Cloudflare dashboard → 101n.app → Security → WAF → Rate Limiting Rules
**Rule:**
- URI Path equals `/api/feeds`
- 60 requests per minute per IP
- Action: Block (10 minutes)

**Done when:** Test script making 100 req/min gets blocked.

### 1.3 Self-hosted CORS proxy
**Risk:** `allorigins.win` and `codetabs.com` are flaky public services. ArticleDetail breaks when they go down.
**File:** Create `functions/api/proxy.js`

```js
const ALLOWED_HOSTS = /\.(aljazeera\.net|bbc\.co\.uk|reuters\.com|...)$/;

export async function onRequest(context) {
  const target = new URL(context.request.url).searchParams.get('url');
  if (!target) return new Response('missing url', { status: 400 });
  let parsed;
  try { parsed = new URL(target); } catch { return new Response('bad url', { status: 400 }); }
  if (!['http:', 'https:'].includes(parsed.protocol)) return new Response('bad protocol', { status: 400 });

  const res = await fetch(target, {
    headers: { 'user-agent': 'Sada/1.0 (+https://101n.app)' },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') || 'text/html',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=300',
    },
  });
}
```

Then in `src/components/article/ArticleDetail.jsx`, replace:
```js
fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`)
```
with:
```js
fetch(`/api/proxy?url=${encodeURIComponent(url)}`)
```

**Done when:** ArticleDetail loads full article body without any external proxies.

### 1.4 Wire up content moderation
**Risk:** Spam appears within hours of launch.
**Files:** `src/hooks/useComments.js`, `functions/api/moderate.js`

In `useComments.js` addComment, before Supabase insert:
```js
const mod = await fetch('/api/moderate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: body }),
});
const { safe, reason } = await mod.json();
if (!safe) {
  setError(reason || 'هذا التعليق غير مناسب');
  return;
}
```

In `functions/api/moderate.js`, gate with:
- Auth required (verify Supabase JWT)
- Rate limit per user (10 comments per hour, KV-backed)
- Llama 3.1 8B prompt: "Is this Arabic comment toxic, spam, or harmful? Answer only 'safe' or 'unsafe'."

**Done when:** "f*** off" → rejected. "great article" → accepted.

### 1.5 Sentry error tracking
**Files:** `src/main.jsx`, `.env.local`, Cloudflare Pages env vars

```bash
npm install @sentry/react
```

```jsx
// src/main.jsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // strip PII
    if (event.user) delete event.user.email;
    return event;
  },
});

createRoot(...).render(
  <Sentry.ErrorBoundary fallback={<div>حدث خطأ</div>}>
    <App />
  </Sentry.ErrorBoundary>
);
```

Add `VITE_SENTRY_DSN` to Cloudflare Pages env (production + preview).

**Done when:** Throw an error in dev → see it in Sentry within 30s.

### 1.6 Legal pages (Privacy + Terms)
**Risk:** Legally required for auth + comments. Required for app store listings.
**Files:** Create `src/components/legal/Privacy.jsx`, `src/components/legal/Terms.jsx`

Generate boilerplate at termly.io or getterms.io. Must mention:
- Data collected: email, display name, IP (Cloudflare), comments, reactions
- Third parties: Supabase (US), Cloudflare (global), Mapbox (US), Workers AI
- Retention: until account deletion request
- Deletion contact: an email you actually monitor
- Cookie use: only essential (auth session, theme preference)

Link from Settings page footer + onboarding signup screen.

**Done when:** `/privacy` and `/terms` render full Arabic content.

---

## Phase 2 — Production essentials (Tier 1.5)

### 2.1 PWA service worker
**Risk:** Calling it a "PWA" without one is technically false; no offline; no install prompt.

```bash
npm install -D vite-plugin-pwa
```

```js
// vite.config.js
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'غرفة الأخبار',
        short_name: 'غرفة',
        description: 'الأخبار العربية في الزمن الحقيقي',
        theme_color: '#0a0a0f',
        background_color: '#0a0a0f',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /\/api\/feeds/,
            handler: 'NetworkFirst',
            options: { cacheName: 'feed-cache', networkTimeoutSeconds: 5 },
          },
          {
            urlPattern: /\.(png|jpg|jpeg|svg|webp)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'images', expiration: { maxEntries: 100 } },
          },
        ],
      },
    }),
  ],
});
```

Create the icon files (use sharp or a generator from your existing logo).

**Done when:** Lighthouse PWA score > 90; Chrome shows the install prompt.

### 2.2 Open Graph for shared article URLs
**Risk:** Currently `?article=ID` URLs share as blank previews. Zero viral lift.
**File:** Create `functions/_middleware.js`

```js
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const articleId = url.searchParams.get('article');
  const response = await context.next();

  if (!articleId) return response;
  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('html')) return response;

  const cached = await context.env.FEED_CACHE?.get('feed:latest', 'json');
  const article = cached?.feed?.find(a => a.id === articleId);
  if (!article) return response;

  const escape = s => (s || '').replace(/[<>&"']/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const title = escape(article.title);
  const desc = escape((article.description || '').slice(0, 200));
  const image = escape(article.image || 'https://101n.app/og-default.png');
  const fullUrl = url.toString();

  const meta = `
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="${image}">
    <meta property="og:url" content="${fullUrl}">
    <meta property="og:type" content="article">
    <meta property="og:locale" content="ar_AR">
    <meta property="og:site_name" content="غرفة الأخبار">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${desc}">
    <meta name="twitter:image" content="${image}">
  `;

  let html = await response.text();
  html = html.replace('</head>', meta + '</head>');
  return new Response(html, {
    status: response.status,
    headers: response.headers,
  });
}
```

**Done when:** Paste a `?article=...` URL in WhatsApp, Twitter, iMessage → all show title + image preview.

### 2.3 Cloudflare Web Analytics
**Where:** Cloudflare dashboard → 101n.app → Analytics → Web Analytics → Enable
- Copy the JS snippet
- Paste in `index.html` before `</body>`
- Pageview limit on free tier: 100k/month — plenty for launch

**Done when:** Visit a few pages → see them in dashboard within 5 minutes.

### 2.4 Security headers
**File:** Create `public/_headers`

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=(), interest-cohort=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' static.cloudflareinsights.com api.mapbox.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com api.mapbox.com; font-src 'self' fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' *.supabase.co *.mapbox.com api.allorigins.win api.codetabs.com sentry.io *.ingest.sentry.io; frame-ancestors 'none'; base-uri 'self';
```

**Done when:** securityheaders.com gives 101n.app an **A** grade.

### 2.5 Supabase backups
**Where:** Supabase dashboard → Database → Backups → Enable Point-in-Time Recovery (or daily on free)
**Done when:** Backup schedule visible in dashboard.

---

## Phase 3 — Performance & QA

### 3.1 Bundle audit
```bash
npm install -D vite-bundle-visualizer
npx vite-bundle-visualizer
```
- Main chunk should be < 200KB gzipped on first paint
- Total JS < 800KB
- Code-split heavy routes:
  ```jsx
  const NewsMap = lazy(() => import('./components/map/NewsMap'));
  const TrendingRadar = lazy(() => import('./components/trending/TrendingRadar'));
  ```
- Wrap in `<Suspense fallback={<Spinner />}>`

**Done when:** Bundle visualizer shows main chunk < 200KB.

### 3.2 Lighthouse audit
```bash
npx lighthouse https://staging.101n.pages.dev --view --preset=mobile
```
- Target: all four scores ≥ 90
- Common fixes:
  - `font-display: swap` on @font-face
  - `loading="lazy"` on below-fold images
  - Add `width`/`height` to images to prevent CLS
  - Remove unused CSS

**Done when:** Mobile scores all ≥ 90.

### 3.3 End-to-end smoke test (manual, on staging)
**Anonymous flow:**
- [ ] Load home → feed renders
- [ ] Scroll → infinite scroll triggers
- [ ] Tap article → detail opens, full text loads
- [ ] Bookmark → persists across reload
- [ ] Open Radar → topics render, sweep animates
- [ ] Open Map → pins render
- [ ] Pull to refresh → loading indicator → fresh feed

**Auth flow:**
- [ ] Sign up new email → profile created
- [ ] Profile setup → display name saved
- [ ] Sign out → anonymous mode works
- [ ] Sign back in → bookmarks restored from cloud

**Social flow:**
- [ ] React to article → count increments → reload → still there
- [ ] Comment on article → comment appears with avatar
- [ ] Try to comment with profanity → rejected by moderation
- [ ] Open another user's profile → follow → count updates

**Devices:**
- [ ] iOS Safari (real device, not simulator)
- [ ] Android Chrome (real device)
- [ ] Desktop Chrome
- [ ] Desktop Firefox

### 3.4 Failure mode testing
- [ ] Disable Workers AI → does translation fall back to original English? Or hide untranslated?
- [ ] Block Supabase URL in network tab → does feed still load? (yes, should)
- [ ] One RSS source 500s → does aggregation continue with other 29?
- [ ] Stop cron-worker → does 1-min cron trigger re-arm DO?
- [ ] Comment when offline → does optimistic UI show then sync on reconnect?

---

## Phase 4 — Launch day

### 4.1 Morning checklist
- [ ] All Phase 1 + 2 items checked off
- [ ] Sentry receiving events from staging
- [ ] Analytics receiving events
- [ ] Backups enabled and visible
- [ ] Legal pages live
- [ ] Lighthouse baseline scores recorded
- [ ] DNS already pointing to Cloudflare Pages
- [ ] Production env vars set (Sentry DSN, INTERNAL_API_KEY)

### 4.2 Deploy to production
```bash
git checkout main
git merge staging
git push origin main  # triggers Pages deploy
```
Wait for green deploy in CF Pages dashboard.

### 4.3 Soft launch (first 4 hours)
- Share with 5 trusted friends first
- Watch Sentry — fix any errors immediately
- Watch CF Analytics — confirm traffic flowing
- Watch Supabase logs — confirm auth/comments working
- Be on standby with hotfixes ready

### 4.4 Public announcement
Only after the 4-hour soft launch passes clean.

### 4.5 First 48 hours
- Check Sentry every 2 hours
- Check Workers AI usage (don't blow the quota)
- Check Supabase storage growth (especially if avatars)
- Check Cloudflare bandwidth

---

## What we're explicitly NOT shipping in week 1

- Image uploads (avatars stay default initials)
- Push notifications
- Realtime comment streaming
- Admin panel (use Supabase dashboard for moderation)
- Search across history (only current feed)
- Activity feed
- Follower/following list views

These get added in weeks 2-4 based on what real users actually want.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Workers AI quota exhausted | Medium | Translation breaks | Auth on AI endpoints + rate limit |
| Supabase free tier exceeded | Low | Auth + comments break | Monitor usage, upgrade if needed |
| RSS source schema change | Medium | One source goes blank | Per-source try/catch in aggregator |
| Comment spam flood | High | Trust collapse | Moderation + per-user rate limit |
| Mapbox quota exhausted | Low | Map view breaks | Lazy-load map only when user opens it |
| Single user hammering /api | Medium | Cost + outage | CF Rate Limiting Rule |
| Sentry quota | Low | Lose error visibility | Use sampling: tracesSampleRate 0.1 |
