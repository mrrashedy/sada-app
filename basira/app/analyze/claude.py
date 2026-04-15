"""Claude API client wrapper.

Thin layer over the Anthropic SDK. Handles:
  - Key loading from settings.
  - JSON-mode prompt call with system prompt = editorial constitution.
  - Token-count logging for cost tracking.
  - Lazy client instantiation (so the app can boot without a key set).
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from anthropic import Anthropic

from app.config import settings

logger = logging.getLogger(__name__)

_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        if not settings.anthropic_api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. Add it to .env before calling the analysis pipeline."
            )
        _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


@dataclass
class ClaudeAnalysisResult:
    data: dict[str, Any]
    model: str
    input_tokens: int
    output_tokens: int


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```", re.IGNORECASE)


def _extract_json(raw: str) -> dict[str, Any]:
    """Parse Claude's response into a dict.

    Handles the three common cases:
      1. Clean JSON object.
      2. JSON wrapped in ```json fenced block.
      3. JSON with leading/trailing prose (we fall back to finding the outermost braces).
    """
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    match = _JSON_FENCE_RE.search(raw)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Fall back: outermost {...}
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = raw[start : end + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as e:
            raise ValueError(f"Claude returned malformed JSON: {e}") from e

    raise ValueError("Claude returned no parseable JSON")


def analyze(
    *,
    system: str,
    user_prompt: str,
    max_tokens: int = 4000,
    temperature: float = 0.2,
) -> ClaudeAnalysisResult:
    """Call Claude with the editorial constitution as system, the user prompt
    as the single message, and parse the response as JSON.
    """
    client = _get_client()
    model = settings.claude_model

    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )

    text_parts: list[str] = []
    for block in response.content:
        # In newer SDK versions content blocks have a `text` attribute.
        text = getattr(block, "text", None)
        if text:
            text_parts.append(text)
    raw = "".join(text_parts).strip()

    data = _extract_json(raw)

    usage = getattr(response, "usage", None)
    input_tokens = getattr(usage, "input_tokens", 0) if usage else 0
    output_tokens = getattr(usage, "output_tokens", 0) if usage else 0

    logger.debug(
        "claude call: model=%s in=%d out=%d", model, input_tokens, output_tokens
    )

    return ClaudeAnalysisResult(
        data=data,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
