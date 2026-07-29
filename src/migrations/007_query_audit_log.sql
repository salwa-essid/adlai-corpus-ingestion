-- ==========================================
-- QUERY AUDIT LOG
-- ==========================================

CREATE TABLE IF NOT EXISTS query_audit_log (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL
    REFERENCES tenants(id)
    ON DELETE CASCADE,
    user_id UUID,
    query_hash TEXT NOT NULL,
    query_text TEXT,
    retrieved_chunk_ids UUID[],
    model_used TEXT,
    response_hash TEXT,
    citation_verifier_status TEXT
    CHECK (
              citation_verifier_status IN (
              'pass',
              'blocked',
              'regenerated'
                                          )
    ),
    latency_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
    )

CREATE INDEX IF NOT EXISTS idx_query_audit_tenant
    ON query_audit_log(tenant_id)
CREATE INDEX IF NOT EXISTS idx_query_audit_created
    ON query_audit_log(created_at)
CREATE INDEX IF NOT EXISTS idx_query_audit_query_hash
    ON query_audit_log(query_hash)