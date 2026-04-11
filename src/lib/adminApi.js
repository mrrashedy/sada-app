// Thin auth wrapper around the /api/admin/* endpoints.
// Pulls the current Supabase JWT and forwards it as a Bearer token.
// Throws on non-2xx or `{ok:false}` responses so callers can `try/catch`.

import { supabase } from './supabase';

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('not_signed_in');
  return { authorization: `Bearer ${token}` };
}

async function adminFetch(path, opts = {}) {
  const auth = await authHeader();
  const r = await fetch(path, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...auth,
      ...(opts.headers || {}),
    },
  });
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok || !data?.ok) {
    const err = new Error(data?.error || `http_${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

export const adminApi = {
  // Articles
  listArticles: () => adminFetch('/api/admin/articles'),
  setArticleOverride: (body) => adminFetch('/api/admin/articles', {
    method: 'POST', body: JSON.stringify(body),
  }),
  clearArticleOverride: (articleId) => adminFetch(
    `/api/admin/articles?article_id=${encodeURIComponent(articleId)}`,
    { method: 'DELETE' },
  ),

  // Radar topics
  listTopics: () => adminFetch('/api/admin/topics'),
  upsertTopic: (body) => adminFetch('/api/admin/topics', {
    method: 'POST', body: JSON.stringify(body),
  }),
  deleteTopic: (id) => adminFetch(
    `/api/admin/topics?id=${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  ),
  deleteTopicByWord: (word, action) => adminFetch(
    `/api/admin/topics?word=${encodeURIComponent(word)}&action=${encodeURIComponent(action)}`,
    { method: 'DELETE' },
  ),

  // Manual feed items
  listItems: () => adminFetch('/api/admin/items'),
  createItem: (body) => adminFetch('/api/admin/items', {
    method: 'POST', body: JSON.stringify(body),
  }),
  updateItem: (id, body) => adminFetch(
    `/api/admin/items?id=${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  ),
  deleteItem: (id) => adminFetch(
    `/api/admin/items?id=${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  ),
};
