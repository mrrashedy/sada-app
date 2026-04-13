// Sada cache-warming worker — Durable Object alarms.
//
// Manages 5 independent pipelines, staggered across 20-second ticks:
//   - News feed (every tick)
//   - Translation warming (every 2nd tick)
//   - Photo grid (every 3rd tick)
//   - Map worldwide (every 4th tick, offset 1)
//   - Radar trending (every 4th tick, offset 3)
// Map and radar never fire on the same tick to avoid subrequest contention.

const BASE                = 'https://sada-app.pages.dev/api/feeds?refresh=1&limit=1';
const REFRESH_URL         = BASE;
const REFRESH_PHOTOS_URL  = `${BASE}&kind=photos`;
const REFRESH_MAP_URL     = `${BASE}&kind=map`;
const REFRESH_RADAR_URL   = `${BASE}&kind=radar`;
const WARM_URL            = 'https://sada-app.pages.dev/api/warm';
const INTERVAL_MS         = 20_000;

export class Refresher {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req) {
    const url = new URL(req.url);
    const current = await this.state.storage.getAlarm();
    const now = Date.now();

    if (url.pathname === '/status') {
      const keys = ['lastRun','lastStatus','lastWarm','lastWarmStatus','lastPhotos','lastPhotosStatus','lastMap','lastMapStatus','lastRadar','lastRadarStatus','tick'];
      const vals = {};
      for (const k of keys) vals[k] = (await this.state.storage.get(k)) || null;
      return Response.json({
        armed: current !== null,
        nextIn: current ? Math.max(0, current - now) : null,
        intervalMs: INTERVAL_MS,
        ...vals,
        lastAgo: vals.lastRun ? `${Math.floor((now - vals.lastRun) / 1000)}s` : 'never',
      });
    }

    if (current === null || current < now) {
      await this.state.storage.setAlarm(now + 1000);
      return new Response('armed', { status: 200 });
    }
    return new Response(`already armed in ${current - now}ms`, { status: 200 });
  }

  async alarm() {
    await this.state.storage.setAlarm(Date.now() + INTERVAL_MS);

    const tick = ((await this.state.storage.get('tick')) || 0) + 1;
    await this.state.storage.put('tick', tick);

    const headers = { 'user-agent': 'sada-refresher/1.0' };
    if (this.env.INTERNAL_API_KEY) headers['x-internal-key'] = this.env.INTERNAL_API_KEY;
    const opts = { headers, cf: { cacheTtl: 0, cacheEverything: false } };

    try {
      // Every tick (20s): refresh main news feed
      const res = await fetch(REFRESH_URL, opts);
      await this.state.storage.put('lastRun', Date.now());
      await this.state.storage.put('lastStatus', `HTTP ${res.status}`);

      // Every 2nd tick (40s): warm translation index
      if (tick % 2 === 0) {
        try {
          const r = await fetch(WARM_URL, opts);
          await this.state.storage.put('lastWarm', Date.now());
          await this.state.storage.put('lastWarmStatus', `HTTP ${r.status}`);
        } catch (e) { await this.state.storage.put('lastWarmStatus', `error: ${e.message}`); }
      }

      // Every 3rd tick (60s): refresh photo grid
      if (tick % 3 === 0) {
        try {
          const r = await fetch(REFRESH_PHOTOS_URL, opts);
          await this.state.storage.put('lastPhotos', Date.now());
          await this.state.storage.put('lastPhotosStatus', `HTTP ${r.status}`);
        } catch (e) { await this.state.storage.put('lastPhotosStatus', `error: ${e.message}`); }
      }

      // Every 4th tick, offset 1 (80s): refresh map worldwide
      if (tick % 4 === 1) {
        try {
          const r = await fetch(REFRESH_MAP_URL, opts);
          await this.state.storage.put('lastMap', Date.now());
          await this.state.storage.put('lastMapStatus', `HTTP ${r.status}`);
        } catch (e) { await this.state.storage.put('lastMapStatus', `error: ${e.message}`); }
      }

      // Every 4th tick, offset 3 (80s): refresh radar
      if (tick % 4 === 3) {
        try {
          const r = await fetch(REFRESH_RADAR_URL, opts);
          await this.state.storage.put('lastRadar', Date.now());
          await this.state.storage.put('lastRadarStatus', `HTTP ${r.status}`);
        } catch (e) { await this.state.storage.put('lastRadarStatus', `error: ${e.message}`); }
      }
    } catch (e) {
      await this.state.storage.put('lastStatus', `error: ${e.message || 'unknown'}`);
    }
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const id = env.REFRESHER.idFromName('singleton');
      const stub = env.REFRESHER.get(id);
      await stub.fetch('https://do/arm');
    })());
  },

  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const id = env.REFRESHER.idFromName('singleton');
    const stub = env.REFRESHER.get(id);

    if (url.pathname === '/status') {
      return stub.fetch('https://do/status');
    }

    const r = await stub.fetch('https://do/arm');
    const text = await r.text();
    return new Response(`refresher: ${text}\nGET /status for details`, { status: 200 });
  },
};
