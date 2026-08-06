"""Local text embeddings via fastembed (ONNX runtime, no torch, no API key).

BAAI/bge-small-en-v1.5 -> 384-dim vectors, matching vector(384) in the schema.
The model is lazy-loaded and cached on first use (downloads once, ~130 MB).
"""

from __future__ import annotations

import threading
from functools import lru_cache

from . import config

_lock = threading.Lock()
_model = None


def _get_model():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from fastembed import TextEmbedding

                _model = TextEmbedding(model_name=config.EMBED_MODEL)
    return _model


def embed(text: str) -> list[float]:
    """Embed a single string -> list[float] of length EMBED_DIM."""
    return embed_many([text or ""])[0]


def embed_many(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    cleaned = [t or "" for t in texts]
    return [vec.tolist() for vec in model.embed(cleaned)]


@lru_cache(maxsize=2048)
def embed_cached(text: str) -> tuple[float, ...]:
    """Cached embedding for repeated inputs (e.g. food names during seeding)."""
    return tuple(embed(text))
