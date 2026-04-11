// Cloudflare Pages Function — /api/moderate
//
// Internal endpoint. Classifies comment text as safe/toxic via Workers AI.
// NOT to be called from the client directly — /api/comments calls this with
// `x-internal-key` before inserting any comment into Supabase. Anonymous
// callers get 401.
//
// Returns: { ok, safe: bool, verdict: 'safe'|'toxic', reason }

import { authenticate, corsPreflight } from '../_lib/auth.js';

const CORS = { 'access-control-allow-origin': '*' };

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Internal-only — must come from a trusted server (cron-worker or
  // /api/comments inside the same Pages project).
  const auth = await authenticate(context);
  if (auth.kind !== 'internal') {
    return Response.json(
      { ok: false, error: 'forbidden' },
      { status: 403, headers: CORS },
    );
  }

  let text;
  try {
    ({ text } = await request.json());
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400, headers: CORS });
  }

  if (!text || typeof text !== 'string') {
    return Response.json({ ok: false, error: 'missing_text' }, { status: 400, headers: CORS });
  }

  // Trivially short — pass through. Saves an AI call.
  const trimmed = text.trim();
  if (trimmed.length < 2) {
    return Response.json({ ok: true, safe: true, verdict: 'safe', reason: 'too_short' }, { headers: CORS });
  }

  const ai = env?.AI;
  if (!ai) {
    // Fail open — moderation is best-effort. Comment will still be flagged
    // for review by a separate background job.
    return Response.json({ ok: true, safe: true, verdict: 'safe', reason: 'no_ai' }, { headers: CORS });
  }

  const prompt = `You are a content moderator for an Arabic news discussion platform. Analyze this comment and respond with ONLY "safe" or "toxic". A comment is toxic if it contains: hate speech, personal attacks, threats, doxxing, spam, or sexually explicit content. Constructive criticism and strong political opinions are allowed.

Comment: "${trimmed.slice(0, 800)}"

Verdict:`;

  try {
    const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are a content moderator. Respond with only "safe" or "toxic".' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 10,
      temperature: 0.1,
    });

    const verdict = (result?.response || '').toLowerCase().trim();
    const isSafe = !verdict.includes('toxic');

    return Response.json(
      { ok: true, safe: isSafe, verdict: isSafe ? 'safe' : 'toxic' },
      { headers: CORS },
    );
  } catch (e) {
    // AI errored — fail open. Better to allow a few bad comments than block
    // every user during a model outage.
    return Response.json(
      { ok: true, safe: true, verdict: 'safe', reason: 'ai_error', detail: e.message },
      { headers: CORS },
    );
  }
}
