"""Central configuration. All secrets/knobs come from the environment with
dev-friendly defaults that match docker-compose.yml, so the app runs with zero
setup once the DB container is up.
"""

from __future__ import annotations

import os
import pathlib


def _load_dotenv() -> None:
    """Load backend/.env (gitignored) into the environment without overriding
    already-set vars. Zero-dependency; keeps secrets out of source + shell history."""
    env_path = pathlib.Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


_load_dotenv()

# --- Postgres -------------------------------------------------------------
PGHOST = os.getenv("PGHOST", "localhost")
PGPORT = os.getenv("PGPORT", "5433")  # host port from docker-compose
PGDATABASE = os.getenv("PGDATABASE", "morsel")

# Read/write app role (ingestion + read endpoints).
APP_DSN = os.getenv(
    "MORSEL_APP_DSN",
    f"host={PGHOST} port={PGPORT} dbname={PGDATABASE} user=morsel_app password=morsel_app_pw",
)
# SELECT-only role used EXCLUSIVELY to run LLM-generated SQL (safety layer).
RO_DSN = os.getenv(
    "MORSEL_RO_DSN",
    f"host={PGHOST} port={PGPORT} dbname={PGDATABASE} user=morsel_ro password=morsel_ro_pw",
)

# --- Identity (single implicit user for now; RLS plumbing is real) --------
DEFAULT_USER_ID = os.getenv("MORSEL_USER_ID", "user-1")

# --- Auth -----------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-change-me-in-prod")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "720"))  # 30 days
SEED_ON_SIGNUP = os.getenv("SEED_ON_SIGNUP", "1") == "1"  # give new users sample data

# --- LLM (provider-agnostic) ----------------------------------------------
# LLM_PROVIDER: gemini | anthropic | openai | groq | openrouter | ollama | vllm | "" (stub)
# gemini + all the openai-compatible providers go through the OpenAI SDK; only
# anthropic uses the Anthropic SDK. Empty/unset with no key => keyword stub.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "").lower()
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")
ANTHROPIC_FAST_MODEL = os.getenv("ANTHROPIC_FAST_MODEL", "claude-haiku-4-5-20251001")

_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/"


def _resolve_llm() -> tuple[str, str, str, str]:
    """Return (kind, base_url, model, api_key). kind in {anthropic, openai, stub}."""
    base = os.getenv("LLM_BASE_URL", "")
    model = os.getenv("LLM_MODEL", "")
    key = os.getenv("LLM_API_KEY", "")
    if LLM_PROVIDER == "gemini" or (not LLM_PROVIDER and GEMINI_API_KEY):
        return "openai", base or _GEMINI_BASE, model or "gemini-2.5-flash", key or GEMINI_API_KEY
    if LLM_PROVIDER == "anthropic" or (not LLM_PROVIDER and ANTHROPIC_API_KEY):
        return "anthropic", "", model or ANTHROPIC_MODEL, key or ANTHROPIC_API_KEY
    if LLM_PROVIDER in ("openai", "groq", "openrouter", "ollama", "vllm") or base:
        # local endpoints (ollama/vllm) usually need no key
        return "openai", base, model or "gpt-4o-mini", key or "not-needed"
    return "stub", "", "", ""


LLM_KIND, LLM_BASE_URL, LLM_MODEL, LLM_KEY = _resolve_llm()
# real when we have a key, or a base_url (e.g. local Ollama/vLLM without a key)
USE_REAL_LLM = LLM_KIND in ("anthropic", "openai") and bool(LLM_KEY or LLM_BASE_URL)

# --- USDA FoodData Central ------------------------------------------------
USDA_API_KEY = os.getenv("USDA_API_KEY", "DEMO_KEY")
USDA_BASE_URL = "https://api.nal.usda.gov/fdc/v1"

# --- Embeddings -----------------------------------------------------------
EMBED_MODEL = os.getenv("EMBED_MODEL", "BAAI/bge-small-en-v1.5")
EMBED_DIM = 384

# --- Retrieval knobs ------------------------------------------------------
SEMANTIC_TOP_K = 20        # candidates per retrieval arm before RRF
RRF_K = 60                 # Reciprocal Rank Fusion constant (field standard)
ENTITY_MATCH_THRESHOLD = 0.82   # cosine sim to link a food to an existing entity
SQL_ROW_LIMIT = 1000       # forced LIMIT injected into every generated query
