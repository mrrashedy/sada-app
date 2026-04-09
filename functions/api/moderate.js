// Cloudflare Pages Function — /api/moderate
// AI-powered content moderation for comments
// Uses Workers AI to classify comment text as safe/toxic

export async function onRequestPost(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }

  const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    const { text, commentId } = await request.json();
    if (!text || text.length < 2) {
      return Response.json({ ok: true, safe: true, reason: 'too_short' }, { headers: CORS });
    }

    const ai = env?.AI;
    if (!ai) {
      // No AI binding — allow by default (moderation is best-effort)
      return Response.json({ ok: true, safe: true, reason: 'no_ai' }, { headers: CORS });
    }

    // Use Workers AI text classification
    const prompt = `You are a content moderator for an Arabic news discussion platform. Analyze this comment and respond with ONLY "safe" or "toxic". A comment is toxic if it contains: hate speech, personal attacks, threats, spam, or sexually explicit content. Constructive criticism and strong political opinions are allowed.

Comment: "${text.slice(0, 500)}"

Verdict:`;

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

    // If toxic and we have Supabase, flag the comment
    if (!isSafe && commentId && env?.SUPABASE_URL && env?.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        await fetch(`${env.SUPABASE_URL}/rest/v1/comments?id=eq.${commentId}`, {
          method: 'PATCH',
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ flagged: true }),
        });
      } catch {}
    }

    return Response.json({ ok: true, safe: isSafe, verdict }, { headers: CORS });

  } catch (e) {
    // On error, allow the comment (don't block users due to AI failures)
    return Response.json({ ok: true, safe: true, reason: 'error', error: e.message }, { headers: CORS });
  }
}
