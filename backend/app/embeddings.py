"""Text embeddings, provider-configurable (config.EMBED_PROVIDER):

  local  -> fastembed BAAI/bge-small-en-v1.5 (384-dim, in-process, no key).
            Lazy-loaded (~130 MB) — great on a big-RAM host / local dev.
  gemini -> Google text-embedding-004 API (768-dim). No local model, so the
            backend stays light enough for small free hosts (Render 512 MB).

Both return list[float] of length config.EMBED_DIM, matching the vector(N) column.
"""

from __future__ import annotations

import threading
from functools import lru_cache

from . import config

_lock = threading.Lock()
_model = None

_GENAI_BASE = "https://generativelanguage.googleapis.com/v1beta"


# --- local (fastembed) -----------------------------------------------------

def _get_model():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from fastembed import TextEmbedding

                _model = TextEmbedding(model_name=config.EMBED_MODEL)
    return _model


def _embed_local(texts: list[str]) -> list[list[float]]:
    return [vec.tolist() for vec in _get_model().embed(texts)]


# --- gemini (API) ----------------------------------------------------------

def _embed_gemini(texts: list[str]) -> list[list[float]]:
    # gemini-embedding-001 exposes only single embedContent (no sync batch), and
    # defaults to 3072 dims — so we request outputDimensionality to match the
    # vector(EMBED_DIM) column. Retries cover free-tier rate limits.
    import time

    import httpx

    key = config.GEMINI_API_KEY or config.LLM_KEY
    model = config.EMBED_MODEL
    out: list[list[float]] = []
    for t in texts:
        body = {
            "model": f"models/{model}",
            "content": {"parts": [{"text": t or " "}]},
            "outputDimensionality": config.EMBED_DIM,
        }
        for attempt in range(4):
            try:
                resp = httpx.post(
                    f"{_GENAI_BASE}/models/{model}:embedContent",
                    params={"key": key}, json=body, timeout=30,
                )
                resp.raise_for_status()
                out.append(resp.json()["embedding"]["values"])
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(0.8 * (attempt + 1))
    return out


# --- public API ------------------------------------------------------------

def embed(text: str) -> list[float]:
    """Embed a single string -> list[float] of length EMBED_DIM."""
    return embed_many([text or ""])[0]


def embed_many(texts: list[str]) -> list[list[float]]:
    cleaned = [t or "" for t in texts]
    if config.EMBED_PROVIDER == "gemini":
        return _embed_gemini(cleaned)
    return _embed_local(cleaned)


@lru_cache(maxsize=2048)
def embed_cached(text: str) -> tuple[float, ...]:
    """Cached embedding for repeated inputs (e.g. food names during seeding)."""
    return tuple(embed(text))
