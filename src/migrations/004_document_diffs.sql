-- ==========================================
-- DOCUMENT DIFFS
-- ==========================================

CREATE TABLE IF NOT EXISTS document_diffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL
    REFERENCES sources(id),
    old_document_id UUID
    REFERENCES documents(id),
    new_document_id UUID NOT NULL
    REFERENCES documents(id),
    diff_summary JSONB,
    llm_impact_analysis TEXT,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    notified_at TIMESTAMPTZ
    );

CREATE INDEX IF NOT EXISTS idx_document_diffs_source
    ON document_diffs(source_id);
CREATE INDEX IF NOT EXISTS idx_document_diffs_old
    ON document_diffs(old_document_id);
CREATE INDEX IF NOT EXISTS idx_document_diffs_new
    ON document_diffs(new_document_id);