# صَدى — Sada

Arabic news platform — elegant, personalized, social.

## Quick Start

```bash
npm install
npm run dev
```

Works immediately with sample data. Live news activates on Cloudflare.

## Deploy to Cloudflare Pages (5 min, free)

### Option A: Git (recommended)

1. Push to GitHub:
```bash
git init
git add .
git commit -m "launch"
git remote add origin https://github.com/YOUR_USER/sada-app.git
git push -u origin main
```

2. Go to dash.cloudflare.com → Pages → Create a project
3. Connect your GitHub repo
4. Build settings:
   - Framework: Vite
   - Build command: `npm run build`
   - Output directory: `dist`
5. Click Deploy

Live in ~60 seconds at `sada-app.pages.dev`

### Option B: Direct upload

```bash
npm run build
```

Go to dash.cloudflare.com → Pages → Upload assets → drag the `dist/` folder.

Note: Direct upload does not support Functions. Use Git method for live news.

### Custom domain

Pages dashboard → Custom domains → Add `sada.yourdomain.com`
Cloudflare handles SSL automatically.

## How It Works

- `/api/feeds` — Cloudflare Workers function fetches live Arabic RSS from 8 sources
- Cloudflare edge caches responses for 2 min globally
- App auto-refreshes every 2 min
- Falls back to sample data when offline

## News Sources

Al Jazeera, Al Arabiya, BBC Arabic, Sky News Arabia, France 24, DW, RT Arabic, CNBC Arabia.

Add more in `functions/api/feeds.js` → `SOURCES`.

## Optional: User Accounts (Supabase)

```bash
cp .env.example .env
# Add your Supabase URL and anon key
```

Add the same env vars in Cloudflare Pages → Settings → Environment variables.

## Structure

```
functions/api/feeds.js  — Cloudflare Workers RSS fetcher
src/App.jsx             — Full app
src/lib/useNews.js      — News hook with fallback
src/lib/supabase.js     — Auth + persistence (optional)
public/manifest.json    — PWA config
public/sw.js            — Offline caching
public/_redirects       — SPA routing
```

## License

Proprietary — All rights reserved.
