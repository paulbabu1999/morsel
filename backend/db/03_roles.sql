-- Two application roles with least privilege. Runs last, as the DB owner.
-- Dev passwords are mirrored in backend/app/config.py.
--
--   morsel_app : read/write, used by the ingestion + read endpoints
--   morsel_ro  : SELECT-only, used EXCLUSIVELY to execute LLM-generated SQL.
--                This role is the primary, DB-enforced text-to-SQL safety layer
--                (AST validation + forced LIMIT are the app-side layers on top).

-- Nobody should be able to create objects in public (blocks "CREATE TABLE ..."
-- even if SELECT-only grants are present).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Read/write application role -----------------------------------------------
CREATE ROLE morsel_app WITH LOGIN PASSWORD 'morsel_app_pw'
    NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE morsel TO morsel_app;
GRANT USAGE ON SCHEMA public TO morsel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO morsel_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO morsel_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO morsel_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO morsel_app;

-- Read-only role for LLM-generated SQL --------------------------------------
CREATE ROLE morsel_ro WITH LOGIN PASSWORD 'morsel_ro_pw'
    NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE morsel TO morsel_ro;
GRANT USAGE ON SCHEMA public TO morsel_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO morsel_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO morsel_ro;
-- Belt-and-suspenders on top of the missing write grants:
ALTER ROLE morsel_ro SET default_transaction_read_only = on;
ALTER ROLE morsel_ro SET statement_timeout = '5s';

-- The read-only role runs LLM-generated SQL; it must never reach password
-- hashes. (The app-side table allowlist also blocks `users`, but revoke too.)
REVOKE ALL ON users FROM morsel_ro;

-- Read-only, cross-user analytics role ---------------------------------------
-- Used ONLY by the admin dashboard's aggregate endpoints (app/analytics_service.py
-- via db.run_analytics_sql). BYPASSRLS so it can count/sum across ALL users —
-- morsel_app is NOBYPASSRLS and only ever sees one user via the GUC. Hard-bounded:
-- SELECT-only, read-only transactions, a statement timeout, password_hash never
-- granted, and it MUST NEVER run LLM-generated SQL (that stays on morsel_ro).
CREATE ROLE morsel_analytics WITH LOGIN PASSWORD 'morsel_analytics_pw'
    NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
GRANT CONNECT ON DATABASE morsel TO morsel_analytics;
GRANT USAGE ON SCHEMA public TO morsel_analytics;
GRANT SELECT ON meals, meal_items, user_profile, weight_logs, food_entities,
                 follows, groups, group_members, shared_meals, events
    TO morsel_analytics;
-- users: only non-secret columns (never password_hash).
GRANT SELECT (id, email, created_at, display_name) ON users TO morsel_analytics;
ALTER ROLE morsel_analytics SET default_transaction_read_only = on;
ALTER ROLE morsel_analytics SET statement_timeout = '15s';

-- The LLM text-to-SQL role must NEVER read behavioral telemetry. The
-- "GRANT SELECT ON ALL TABLES" above already handed morsel_ro the new events
-- table, so take it back explicitly (belt-and-suspenders on top of the app-side
-- table allowlist in sql_guard.py, which also omits `events`).
REVOKE ALL ON events FROM morsel_ro;
