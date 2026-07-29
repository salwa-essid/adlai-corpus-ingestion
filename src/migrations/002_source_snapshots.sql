-- ==========================================
-- SOURCE SNAPSHOTS
-- ==========================================

CREATE TABLE IF NOT EXISTS source_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES sources(id),
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    content_hash TEXT NOT NULL,
    storage_ref TEXT NOT NULL,
    content_type TEXT NOT NULL
    )
CREATE INDEX IF NOT EXISTS idx_source_snapshots_source
    ON source_snapshots(source_id);
CREATE INDEX IF NOT EXISTS idx_source_snapshots_hash
    ON source_snapshots(content_hash);