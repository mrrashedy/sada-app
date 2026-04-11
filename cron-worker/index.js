// Sada cache-warming worker — Durable Object alarms.
//
// Workers Paid unlocks Durable Object alarms, which let us schedule arbitrary
// intervals (cron minimum is 1 minute on every plan). We run a single
// `Refresher` DO that fires an alarm every ~20 seconds, hits
// /api/feeds?refresh=1 to force re-aggregation, and re-arms itself.
//
// A 1-minute cron trigger acts as a failsafe: if the DO ever stops ticking
// (deployment, unexpected termination, etc.) the cron pings it to re-arm.

const REFRESH_URL = 'https://sada-app.pages.dev/api/feeds?refresh=1&limit=1';
const WARM_URL = 'https://sada-app.pages.dev/api/warm';
const INTERVAL_MS = 20_000; // 20s — effective refresh cadence
// Warm runs on every other tick (~40s) so it doesn't race ahead of new items
// and so the separate invocation gets a full subrequest budget.
const WARM_EVERY_N_TICKS = 2;

export class Refresher {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  // Idempotent arm: if no alarm is set (or it's in the past), set one for
  // 1s from now so the loop kicks off immediately.
  async fetch(req) {
    const url = new URL(req.url);
    const current = await this.state.storage.getAlarm();
    const now = Date.now();

    if (url.pathname === '/status') {
      const lastRun = (await this.state.storage.get('lastRun')) || 0;
      const lastStatus = (await this.state.storage.get('lastStatus')) || 'never';
      return Response.json({
        armed: current !== null,
        nextIn: current ? Math.max(0, current - now) : null,
        lastRun,
        lastAgo: lastRun ? `${Math.floor((now - lastRun) / 1000)}s` : 'never',
        lastStatus,
        intervalMs: INTERVAL_MS,
      });
    }

    if (current === null || current < now) {
      await this.state.storage.setAlarm(now + 1000);
      return new Response('armed', { status: 200 });
    }
    return new Response(`already armed in ${current - now}ms`, { status: 200 });
  }

  async alarm() {
    // Re-arm FIRST so a slow/failed refresh doesn't stop the loop.
    await this.state.storage.setAlarm(Date.now() + INTERVAL_MS);

    try {
      const headers = { 'user-agent': 'sada-refresher/1.0' };
      if (this.env.INTERNAL_API_KEY) {
        headers['x-internal-key'] = this.env.INTERNAL_API_KEY;
      }
      // 1. Refresh the feed aggregation cache
      const res = await fetch(REFRESH_URL, {
        headers,
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      await this.state.storage.put('lastRun', Date.now());
      await this.state.storage.put('lastStatus', `HTTP ${res.status}`);

      // 2. Every N ticks, also warm the translation index (separate invocation
      // so it gets its own subrequest budget). This populates the KV index
      // used by /api/feeds at read time.
      const tick = ((await this.state.storage.get('tick')) || 0) + 1;
      await this.state.storage.put('tick', tick);
      if (tick % WARM_EVERY_N_TICKS === 0) {
        try {
          const warmRes = await fetch(WARM_URL, { headers, cf: { cacheTtl: 0, cacheEverything: false } });
          await this.state.storage.put('lastWarm', Date.now());
          await this.state.storage.put('lastWarmStatus', `HTTP ${warmRes.status}`);
        } catch (e) {
          await this.state.storage.put('lastWarmStatus', `error: ${e.message || 'unknown'}`);
        }
      }
    } catch (e) {
      await this.state.storage.put('lastStatus', `error: ${e.message || 'unknown'}`);
    }
  }
}

export default {
  // Failsafe cron: ensure the singleton Refresher has its alarm armed.
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const id = env.REFRESHER.idFromName('singleton');
      const stub = env.REFRESHER.get(id);
      await stub.fetch('https://do/arm');
    })());
  },

  // Manual trigger:
  //   GET /        — arm the DO (idempotent)
  //   GET /status  — inspect DO state
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
