#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# 1. Postgres + pgvector (Docker). Compose file lives one level up.
echo "Starting Postgres (pgvector) via docker compose..."
docker compose -f ../docker-compose.yml up -d

echo "Waiting for the database to be healthy..."
for i in $(seq 1 30); do
  status=$(docker inspect --format '{{.State.Health.Status}}' morsel-db 2>/dev/null || echo "starting")
  [ "$status" = "healthy" ] && break
  sleep 2
done

# 2. Python env
if [ ! -d .venv ]; then
  echo "Creating virtualenv..."
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt

# 3. API (seeds sample data on first run via the startup hook)
echo "Starting Morsel API on http://localhost:8000 (docs at /docs)"
echo "  LLM: ${ANTHROPIC_API_KEY:+real Claude}${ANTHROPIC_API_KEY:-keyword/formula stub (set ANTHROPIC_API_KEY for real Claude)}"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
