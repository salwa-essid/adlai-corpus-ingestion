-- ==========================================
-- SCHEMA MIGRATIONS
-- Tracks executed SQL migrations
-- ==========================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name TEXT NOT NULL UNIQUE,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

    );