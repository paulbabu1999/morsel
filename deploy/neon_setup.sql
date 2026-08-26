-- Extensions. Runs first, as the DB owner, on an empty data dir.
CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector: vector(N) type + HNSW/IVFFlat
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- trigram similarity (fuzzy name fallback)

-- Morsel schema. One Postgres DB serves BOTH query paths:
--   * normalized numeric rows (meals, meal_items) for aggregate text-to-SQL
--   * a vector(768) embedding + tsvector on meals for semantic/hybrid search
-- Embedding dim 384 = BAAI/bge-small-en-v1.5 (see backend/app/embeddings.py).
--
-- Nutrient convention:
--   food_entities  -> values are PER 100 g
--   meal_items     -> ABSOLUTE values for the logged portion (per-100g * grams/100)
--   meals          -> ABSOLUTE totals summed from their items

-- ---------------------------------------------------------------------------
-- Canonical foods (entity-resolution table) + USDA FoodData Central cache.
-- Global/shared (not per-user), so no RLS. `fdc_id` is the USDA id when
-- resolved from FoodData Central; source = 'seed' | 'usda' | 'llm' | 'manual'.
-- ---------------------------------------------------------------------------
CREATE TABLE food_entities (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canonical_name  TEXT        NOT NULL,
    aliases         TEXT[]      NOT NULL DEFAULT '{}',
    fdc_id          INTEGER,
    source          TEXT        NOT NULL DEFAULT 'seed',
    default_unit    TEXT        NOT NULL DEFAULT 'serving',
    default_grams   REAL        NOT NULL DEFAULT 100,   -- grams in one default_unit
    -- nutrition PER 100 g
    calories        REAL        NOT NULL DEFAULT 0,
    protein_g       REAL        NOT NULL DEFAULT 0,
    carbs_g         REAL        NOT NULL DEFAULT 0,
    fat_g           REAL        NOT NULL DEFAULT 0,
    fiber_g         REAL        NOT NULL DEFAULT 0,
    sugar_g         REAL        NOT NULL DEFAULT 0,
    sodium_mg       REAL        NOT NULL DEFAULT 0,
    satfat_g        REAL        NOT NULL DEFAULT 0,
    iron_mg         REAL        NOT NULL DEFAULT 0,
    calcium_mg      REAL        NOT NULL DEFAULT 0,
    potassium_mg    REAL        NOT NULL DEFAULT 0,
    name_embedding  vector(768),
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX food_entities_canonical_key ON food_entities (lower(canonical_name));
CREATE INDEX food_entities_name_trgm ON food_entities USING gin (canonical_name gin_trgm_ops);
-- HNSW over the name embedding for similarity-based entity resolution.
CREATE INDEX food_entities_emb_hnsw ON food_entities
    USING hnsw (name_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ---------------------------------------------------------------------------
-- Per-user profile + LLM/formula-derived calorie & nutrient targets.
-- One row per user. `target_source` records whether targets came from the
-- Claude call ('llm') or the deterministic fallback ('formula').
-- ---------------------------------------------------------------------------
CREATE TABLE user_profile (
    user_id                 TEXT        PRIMARY KEY,
    age                     INTEGER,
    sex                     TEXT,                       -- 'male' | 'female' | 'other'
    height_cm               REAL,
    weight_kg               REAL,
    activity_level          TEXT,                       -- sedentary|light|moderate|active|very_active
    goal_type               TEXT,                       -- lose | maintain | gain
    goal_rate               TEXT,                       -- e.g. '0.5kg/week' (free text)
    -- targets
    daily_calorie_target    INTEGER,
    protein_target_g        REAL,
    carb_target_g           REAL,
    fat_target_g            REAL,
    fiber_target_g          REAL,
    sugar_limit_g           REAL,
    sodium_limit_mg         REAL,
    satfat_limit_g          REAL,
    iron_target_mg          REAL,
    calcium_target_mg       REAL,
    potassium_target_mg     REAL,
    tdee_estimate           INTEGER,
    target_source           TEXT        NOT NULL DEFAULT 'formula',
    rationale               TEXT,
    onboarded               BOOLEAN     NOT NULL DEFAULT false,
    updated_at              TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Meals: one row per logged meal. Holds ABSOLUTE nutrient totals plus the
-- semantic search columns (embedding + generated tsvector).
-- ---------------------------------------------------------------------------
CREATE TABLE meals (
    id              TEXT        PRIMARY KEY,
    user_id         TEXT        NOT NULL,
    eaten_at        TIMESTAMP NOT NULL,
    meal_type       TEXT        NOT NULL,               -- breakfast|lunch|dinner|snack
    location_text   TEXT,
    photo_uri       TEXT,                       -- primary thumbnail (first photo)
    photo_uris      TEXT[]      NOT NULL DEFAULT '{}',  -- all photos for this meal
    note_text       TEXT,
    description     TEXT        NOT NULL DEFAULT '',     -- concatenated text used for the embedding
    tags            TEXT[]      NOT NULL DEFAULT '{}',
    source          TEXT        NOT NULL DEFAULT 'phone',
    confidence      REAL        NOT NULL DEFAULT 0.9,
    total_calories      INTEGER NOT NULL DEFAULT 0,
    total_protein_g     REAL    NOT NULL DEFAULT 0,
    total_carbs_g       REAL    NOT NULL DEFAULT 0,
    total_fat_g         REAL    NOT NULL DEFAULT 0,
    total_fiber_g       REAL    NOT NULL DEFAULT 0,
    total_sugar_g       REAL    NOT NULL DEFAULT 0,
    total_sodium_mg     REAL    NOT NULL DEFAULT 0,
    total_satfat_g      REAL    NOT NULL DEFAULT 0,
    total_iron_mg       REAL    NOT NULL DEFAULT 0,
    total_calcium_mg    REAL    NOT NULL DEFAULT 0,
    total_potassium_mg  REAL    NOT NULL DEFAULT 0,
    embedding       vector(768),
    -- tags are intentionally omitted: array_to_string is only STABLE, which a
    -- generated column forbids. description already carries item names/location.
    description_tsv tsvector GENERATED ALWAYS AS (
        to_tsvector('english'::regconfig,
            coalesce(description, '') || ' ' ||
            coalesce(location_text, '') || ' ' ||
            coalesce(note_text, ''))
    ) STORED,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX meals_user_eaten_idx ON meals (user_id, eaten_at DESC);
CREATE INDEX meals_tsv_idx ON meals USING gin (description_tsv);
CREATE INDEX meals_emb_hnsw ON meals
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ---------------------------------------------------------------------------
-- Meal items: one row per food item. ABSOLUTE nutrient values for the logged
-- portion. `user_id` is denormalized so RLS applies here too. `food_entity_id`
-- links to the canonical food (nullable if resolution failed).
-- ---------------------------------------------------------------------------
CREATE TABLE meal_items (
    id              TEXT        PRIMARY KEY,
    meal_id         TEXT        NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    user_id         TEXT        NOT NULL,
    food_entity_id  BIGINT      REFERENCES food_entities(id),
    raw_name        TEXT        NOT NULL,
    canonical_name  TEXT        NOT NULL,
    quantity        REAL        NOT NULL DEFAULT 1,
    unit            TEXT        NOT NULL DEFAULT 'serving',
    grams           REAL        NOT NULL DEFAULT 100,
    calories        INTEGER     NOT NULL DEFAULT 0,
    protein_g       REAL        NOT NULL DEFAULT 0,
    carbs_g         REAL        NOT NULL DEFAULT 0,
    fat_g           REAL        NOT NULL DEFAULT 0,
    fiber_g         REAL        NOT NULL DEFAULT 0,
    sugar_g         REAL        NOT NULL DEFAULT 0,
    sodium_mg       REAL        NOT NULL DEFAULT 0,
    satfat_g        REAL        NOT NULL DEFAULT 0,
    iron_mg         REAL        NOT NULL DEFAULT 0,
    calcium_mg      REAL        NOT NULL DEFAULT 0,
    potassium_mg    REAL        NOT NULL DEFAULT 0,
    confidence      REAL        NOT NULL DEFAULT 0.9
);
CREATE INDEX meal_items_meal_idx ON meal_items (meal_id);
CREATE INDEX meal_items_user_idx ON meal_items (user_id);

-- ---------------------------------------------------------------------------
-- Auth: accounts. `id` (a uuid string) is what every other table's user_id
-- references. No RLS here (login must read it before a user is known); the
-- read-only text-to-SQL role is explicitly denied access in 03_roles.sql.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id              TEXT        PRIMARY KEY,
    email           TEXT        NOT NULL,
    password_hash   TEXT        NOT NULL,
    created_at      TIMESTAMP   NOT NULL DEFAULT now()
);
-- case-insensitive uniqueness (also the only email index; a column-level UNIQUE
-- would auto-create a clashing "users_email_key").
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- ---------------------------------------------------------------------------
-- Row-Level Security. Isolate rows by the app-set GUC app.current_user_id.
-- FORCE so the table owner is subject to it too. The read-only SQL role never
-- sees other users' rows even if a generated query "forgets" the WHERE clause.
-- ---------------------------------------------------------------------------
ALTER TABLE meals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals        FORCE  ROW LEVEL SECURITY;
ALTER TABLE meal_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_items   FORCE  ROW LEVEL SECURITY;
ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profile FORCE  ROW LEVEL SECURITY;

CREATE POLICY meals_isolation ON meals
    USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY meal_items_isolation ON meal_items
    USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY user_profile_isolation ON user_profile
    USING (user_id = current_setting('app.current_user_id', true));

CREATE ROLE morsel_ro WITH LOGIN PASSWORD 'MORSEL_RO_PW' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA public TO morsel_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO morsel_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO morsel_ro;
ALTER ROLE morsel_ro SET default_transaction_read_only = on;
ALTER ROLE morsel_ro SET statement_timeout = '5s';
REVOKE ALL ON users FROM morsel_ro;

-- ---------------------------------------------------------------------------
-- Read/write app role.  CRITICAL on Neon: the DB owner (`neondb_owner`) has
-- rolbypassrls=true, which SKIPS RLS entirely — if the app connected as the
-- owner, every user would see every user's rows. So the app MUST connect as
-- this dedicated NOBYPASSRLS role for the FORCE'd policies above to enforce.
-- Point MORSEL_APP_DSN at morsel_app (NOT neondb_owner).
-- ---------------------------------------------------------------------------
CREATE ROLE morsel_app WITH LOGIN PASSWORD 'MORSEL_APP_PW' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO morsel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO morsel_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO morsel_app;

-- ---------------------------------------------------------------------------
-- Social layer (follows, groups, shared meals). Cross-user by nature, so NO
-- row-level security — visibility is enforced in app/social.py queries. Sharing
-- writes a denormalized snapshot into shared_meals; it never exposes `meals`.
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;

CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL,
    followee_id TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows (followee_id);

CREATE TABLE IF NOT EXISTS groups (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    owner_id    TEXT NOT NULL,
    invite_code TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
    group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id   TEXT NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members (user_id);

CREATE TABLE IF NOT EXISTS shared_meals (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    meal_id        TEXT,
    group_id       TEXT REFERENCES groups(id) ON DELETE CASCADE,
    meal_type      TEXT,
    description    TEXT NOT NULL DEFAULT '',
    note           TEXT,
    photo_uri      TEXT,
    total_calories INTEGER,
    eaten_at       TIMESTAMP,
    shared_at      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_meals_user_idx ON shared_meals (user_id, shared_at DESC);
CREATE INDEX IF NOT EXISTS shared_meals_group_idx ON shared_meals (group_id, shared_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON follows, groups, group_members, shared_meals TO morsel_app;
