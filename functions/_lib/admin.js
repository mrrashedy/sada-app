// Admin auth helper for Pages Functions.
//
// Wraps `authenticate()` from auth.js with an admin allowlist check.
// The allowlist is the env var ADMIN_USER_IDS (comma-separated UUIDs).
//
//   - If ADMIN_USER_IDS is unset → any authenticated user is admin
//     (open-access setup mode, prints a warning header)
//   - If ADMIN_USER_IDS is set   → only listed UUIDs may write
//   - Internal callers (x-internal-key) always pass
//
// Usage:
//   import { requireAdmin, supabaseService, logCuration } from '../../_lib/admin.js';
//
//   export async function onRequest(context) {
//     const guard = await requireAdmin(context);
//     if (!guard.ok) return guard.response;
//     // ... guard.userId is the actor; guard.openAccess flags setup mode
//   }

import { authenticate, jsonResponse } from './auth.js';

function getAdminIds(env) {
  return (env?.ADMIN_USER_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export async function requireAdmin(context) {
  const auth = await authenticate(context, { allowAnonymous: true });

  if (auth.kind === 'internal') {
    return { ok: true, kind: 'internal', userId: null };
  }

  if (auth.kind !== 'user') {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }

  const allowedIds = getAdminIds(context.env);
  if (allowedIds.length === 0) {
    // Open access mode — useful before the env var is set, but logged.
    return { ok: true, kind: 'user', userId: auth.userId, openAccess: true };
  }

  if (!allowedIds.includes(auth.userId)) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'forbidden' }, { status: 403 }),
    };
  }

  return { ok: true, kind: 'user', userId: auth.userId };
}

// Service-role Supabase REST client. Bypasses RLS — only used by admin
// endpoints that have already passed `requireAdmin`.
export function supabaseService(env) {
  const url = env?.SUPABASE_URL;
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    async select(table, query = '') {
      const r = await fetch(`${url}/rest/v1/${table}?${query}`, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
      });
      if (!r.ok) throw new Error(`supabase select ${table} ${r.status}`);
      return r.json();
    },
    async insert(table, body, { upsert = false } = {}) {
      const r = await fetch(`${url}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          apikey: key,
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          prefer: upsert ? 'return=representation,resolution=merge-duplicates' : 'return=representation',
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`supabase insert ${table} ${r.status}: ${text}`);
      }
      return r.json();
    },
    async update(table, query, body) {
      const r = await fetch(`${url}/rest/v1/${table}?${query}`, {
        method: 'PATCH',
        headers: {
          apikey: key,
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          prefer: 'return=representation',
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`supabase update ${table} ${r.status}: ${text}`);
      }
      return r.json();
    },
    async delete(table, query) {
      const r = await fetch(`${url}/rest/v1/${table}?${query}`, {
        method: 'DELETE',
        headers: { apikey: key, authorization: `Bearer ${key}` },
      });
      if (!r.ok) throw new Error(`supabase delete ${table} ${r.status}`);
      return true;
    },
  };
}

// Append a row to curation_log. Best-effort — never throws.
export async function logCuration(env, { actorId, action, targetKind, targetId, payload }) {
  try {
    const sb = supabaseService(env);
    if (!sb) return;
    await sb.insert('curation_log', [{
      actor_id: actorId || null,
      action,
      target_kind: targetKind,
      target_id: targetId ? String(targetId) : null,
      payload: payload || null,
    }]);
  } catch (e) {
    // Audit log failures are non-fatal; we don't want to fail the main action.
    console.warn('[admin] curation log failed:', e.message);
  }
}
