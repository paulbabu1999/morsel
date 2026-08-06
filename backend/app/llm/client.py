"""Provider-agnostic LLM client.

Two backends behind one interface (`call_tool` for structured JSON, `call_text`):
  * anthropic  -> Anthropic SDK (forced tool-use)
  * openai     -> OpenAI SDK against any OpenAI-compatible endpoint
                  (Gemini AI Studio, Groq, OpenRouter, local Ollama/vLLM)

Which one is chosen comes from config._resolve_llm(). Every call is defensive:
on any error it returns None so the caller falls back to the deterministic stub,
so the app runs no matter the provider/key state.
"""

from __future__ import annotations

import base64
import json
import re

from .. import config

_client = None


def _get_client():
    """Return (kind, sdk_client) or (kind, None) for stub. Cached."""
    global _client
    if _client is None:
        if config.LLM_KIND == "anthropic":
            import anthropic

            _client = ("anthropic", anthropic.Anthropic(api_key=config.LLM_KEY))
        elif config.LLM_KIND == "openai":
            from openai import OpenAI

            _client = (
                "openai",
                OpenAI(base_url=config.LLM_BASE_URL or None, api_key=config.LLM_KEY or "not-needed"),
            )
        else:
            _client = ("stub", None)
    return _client


def _b64(photo_bytes: bytes) -> str:
    return base64.standard_b64encode(photo_bytes).decode("ascii")


def _try_json(text: str) -> dict | None:
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{.*\}", text, re.DOTALL)  # strip prose/fences around JSON
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                return None
    return None


def _transient(exc: Exception) -> bool:
    """Errors worth a quick retry: rate limits, 5xx, and the 403 a freshly
    enabled Gemini project throws while API enablement propagates."""
    s = f"{getattr(exc, 'status_code', '')} {exc}".lower()
    return any(t in s for t in ("429", "500", "502", "503", "403", "timeout", "connection", "overloaded"))


def _retry(fn, tries: int = 3):
    import time

    for i in range(tries):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            if i == tries - 1 or not _transient(exc):
                raise
            time.sleep(0.7 * (i + 1))


def call_tool(
    system: str,
    user_text: str,
    tool_name: str,
    tool_schema: dict,
    photo_bytes: bytes | None = None,
    media_type: str = "image/jpeg",
    model: str | None = None,
    max_tokens: int = 1500,
) -> dict | None:
    """Get a structured JSON object back, or None on any failure."""
    if not config.USE_REAL_LLM:
        return None
    kind, client = _get_client()
    model = model or config.LLM_MODEL
    try:
        if kind == "anthropic":
            content: list = []
            if photo_bytes:
                content.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": _b64(photo_bytes)},
                })
            content.append({"type": "text", "text": user_text})
            resp = client.messages.create(
                model=model, max_tokens=max_tokens, system=system,
                tools=[{"name": tool_name, "description": f"Return {tool_name}", "input_schema": tool_schema}],
                tool_choice={"type": "tool", "name": tool_name},
                messages=[{"role": "user", "content": content}],
            )
            for block in resp.content:
                if getattr(block, "type", None) == "tool_use":
                    return dict(block.input)
            return None

        # openai-compatible: use structured outputs via json_schema response
        # format (NOT forced tool-choice — Gemini's compat endpoint silently
        # ignores tool_choice; and NOT schema-in-prompt — the model then echoes
        # the schema envelope instead of an instance). json_schema is the
        # portable OpenAI standard (OpenAI/Gemini/Groq). The token floor leaves
        # room for models (Gemini 2.5/3 Flash) that spend "thinking" tokens
        # before emitting the JSON.
        content = [{"type": "text", "text": user_text}]
        if photo_bytes:
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:{media_type};base64,{_b64(photo_bytes)}"},
            })
        resp = _retry(lambda: client.chat.completions.create(
            model=model, max_tokens=max(max_tokens, 2048),
            messages=[{"role": "system", "content": system}, {"role": "user", "content": content}],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": tool_name, "schema": tool_schema},
            },
        ))
        msg = resp.choices[0].message
        if getattr(msg, "tool_calls", None):  # if a provider honors tools instead
            return json.loads(msg.tool_calls[0].function.arguments)
        return _try_json(msg.content or "")
    except Exception:
        return None


def call_text(system: str, user_text: str, model: str | None = None, max_tokens: int = 700) -> str | None:
    if not config.USE_REAL_LLM:
        return None
    kind, client = _get_client()
    model = model or config.LLM_MODEL
    try:
        if kind == "anthropic":
            resp = client.messages.create(
                model=model, max_tokens=max_tokens, system=system,
                messages=[{"role": "user", "content": user_text}],
            )
            return "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip() or None
        resp = _retry(lambda: client.chat.completions.create(
            model=model, max_tokens=max(max_tokens, 1024),
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user_text}],
        ))
        return (resp.choices[0].message.content or "").strip() or None
    except Exception:
        return None
