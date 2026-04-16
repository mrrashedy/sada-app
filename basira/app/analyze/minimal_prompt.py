"""Minimal analyze prompt — conclusion + optional quote only.

This is the budget-conscious alternative to the full v2 decomposition
in prompts.py. It asks Claude for exactly two things:

  1. analytical_conclusion — one sentence, the real claim stripped of
     institutional language. The flagship pullquote the reader sees.
  2. key_quote — optional, one sentence pulled verbatim from the body
     if (and only if) one exists that carries the argument. Null when
     no single quote is strong enough.

That's it. No core_argument, no supporting_logic, no tensions, no
if_correct_then, no Arabic/English summaries. Everything the card
renders conditionally, so the rest of the UI just doesn't show those
sections when they're null — the card becomes: title + flagship +
optional quote + tags. Exactly the layout the user asked for.

Cost with Haiku + prompt caching: ~$0.0013/doc.
Volume 300 docs/day at Tier 1+2: ~$12/month.

When the budget grows, flip the model env var to Sonnet for sharper
thesis extraction, or add the full v2 prompt as a second variant for
Tier 1 only.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger("basira.analyze.minimal")


MODEL_DEFAULT = "claude-haiku-4-5"
# NOTE: the exact model id is set via BASIRA_MINIMAL_MODEL so you can swap
# to Sonnet ("claude-sonnet-4-5-20250929") without a code edit.


# The editorial constitution — cacheable prefix. Same for every doc, so
# prompt caching gives us ~90% discount on this portion after the first
# call in a 5-minute window. Kept intentionally short.
SYSTEM_PREFIX = """You are an analyst for a long-form geopolitical \
intelligence engine. Your single job on this document is to extract \
ONE sentence: the real claim the author is making, stripped of \
institutional hedging and promotional language. No summary of topics. \
No list of regions. No methodology. Just the claim itself, as a \
thoughtful reader would paraphrase it after finishing the piece.

Register: academic, plain, non-emotional. If the document is weak, \
vague, or evasive, say so — do not inflate it.

Respond with JSON only, matching this schema exactly:
{
  "analytical_conclusion": "<one sentence, 20-50 words>",
  "key_quote": "<one verbatim sentence from the body OR null>",
  "key_quote_context": "<one phrase explaining why this quote matters OR null>"
}

Rules:
- key_quote must be a sentence that appears LITERALLY in the body. If \
no single quote carries the argument cleanly, set key_quote and \
key_quote_context to null. Do NOT invent or paraphrase. Quotes are \
optional — only surface one when it genuinely carries the argument."""


def _build_user_message(doc: dict[str, Any]) -> str:
    """Compose the per-document user turn.

    Truncates body to ~12k tokens (rough proxy: 48k characters) to keep
    input cost bounded. Full v2 prompt uses 30k; minimal prompt can get
    away with less because we're only asking for one sentence.
    """
    title = doc.get("title", "").strip()
    source = doc.get("depth_sources") or {}
    src_name = (source or {}).get("name") or "(unknown source)"
    src_cat = (source or {}).get("category") or ""
    body = (doc.get("body") or doc.get("abstract") or "").strip()
    if len(body) > 48000:
        body = body[:48000] + "\n\n[... body truncated ...]"

    return (
        f"Source: {src_name} ({src_cat})\n"
        f"Title: {title}\n\n"
        f"--- body ---\n{body}"
    )


def analyze_document_minimal(doc: dict[str, Any]) -> dict[str, Any]:
    """Call Claude with the minimal prompt. Return a normalized dict.

    Return shape:
        {
          "analytical_conclusion": str,
          "key_quotes": [{"quote": str, "context": str}] or None,
          "model": str,
          "input_tokens": int,
          "output_tokens": int,
        }

    Raises on API errors so the worker can log and mark the doc as
    "error". Validates that the JSON response has at least
    analytical_conclusion; missing it is treated as a failure.
    """
    # Deferred import — the worker may run in analyze-only mode, but a
    # runner that skips analysis shouldn't need the anthropic library.
    from anthropic import Anthropic

    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    model = os.environ.get("BASIRA_MINIMAL_MODEL", MODEL_DEFAULT)

    msg = client.messages.create(
        model=model,
        max_tokens=400,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PREFIX,
                # Cache the constitution so subsequent docs in the same
                # 5-minute window pay ~10% of the input cost on this block.
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[
            {"role": "user", "content": _build_user_message(doc)},
        ],
    )

    # Extract text content from the response. Claude messages API returns
    # a list of content blocks; we only care about text blocks.
    raw = ""
    for block in msg.content:
        if getattr(block, "type", None) == "text":
            raw += block.text
    raw = raw.strip()

    # Strip markdown fences if the model wrapped JSON in ```json ... ```.
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:].lstrip()
        raw = raw.rstrip("`").strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Haiku sometimes appends commentary after the closing brace.
        # Try to extract just the first JSON object.
        brace = raw.rfind("}")
        if brace != -1:
            try:
                parsed = json.loads(raw[: brace + 1])
            except json.JSONDecodeError as e2:
                logger.warning("JSON decode failed: %s | raw=%r", e2, raw[:300])
                raise
        else:
            logger.warning("No JSON object found | raw=%r", raw[:300])
            raise ValueError("no JSON in response")

    conclusion = (parsed.get("analytical_conclusion") or "").strip()
    if not conclusion:
        raise ValueError("missing analytical_conclusion in response")

    quote = (parsed.get("key_quote") or "").strip() or None
    quote_ctx = (parsed.get("key_quote_context") or "").strip() or None
    quotes = None
    if quote:
        quotes = [{"quote": quote, "context": quote_ctx}]

    return {
        "analytical_conclusion": conclusion,
        "key_quotes": quotes,
        "model": model,
        "input_tokens": getattr(msg.usage, "input_tokens", None),
        "output_tokens": getattr(msg.usage, "output_tokens", None),
    }
