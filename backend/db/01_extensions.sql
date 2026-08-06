-- Extensions. Runs first, as the DB owner, on an empty data dir.
CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector: vector(N) type + HNSW/IVFFlat
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- trigram similarity (fuzzy name fallback)
