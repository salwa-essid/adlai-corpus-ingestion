-- ==========================================
-- Non-superuser application role.
-- The 'postgres' role is a superuser and ALWAYS bypasses RLS, even
-- with FORCE ROW LEVEL SECURITY — that override is unconditional and
-- can't be disabled per-table. RLS only actually applies when the app
-- connects as a role that is (a) not a superuser and (b) not the
-- table owner (or is the owner but FORCE is set — which we already
-- did in migration 012).
-- CHANGE THE PASSWORD BELOW before running this against anything but
-- a throwaway local dev database.
-- ==========================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'adlai_app') THEN
CREATE ROLE adlai_app WITH LOGIN PASSWORD 'adlai123' NOSUPERUSER NOCREATEDB NOCREATEROLE;
END IF;
END
$$;

GRANT CONNECT ON DATABASE adlai TO adlai_app;
GRANT USAGE ON SCHEMA public TO adlai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO adlai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO adlai_app;

-- So future migrations' new tables are covered automatically too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO adlai_app;