-- ==========================================
-- ATTORNEY REVIEWS
-- ==========================================

CREATE TABLE IF NOT EXISTS attorney_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL
    REFERENCES tenants(id)
    ON DELETE CASCADE,
    query_id UUID NOT NULL
    REFERENCES query_audit_log(id)
    ON DELETE CASCADE,
    reviewer_id UUID NOT NULL,
    decision TEXT NOT NULL
    CHECK (
              decision IN (
              'approve',
              'reject',
              'edit_approve'
                          )
    ),
    reject_reason TEXT,
    edited_response TEXT,
    sla_deadline TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ
    )

CREATE INDEX IF NOT EXISTS idx_attorney_reviews_tenant
    ON attorney_reviews(tenant_id);

CREATE INDEX IF NOT EXISTS idx_attorney_reviews_query
    ON attorney_reviews(query_id);

CREATE INDEX IF NOT EXISTS idx_attorney_reviews_decision
    ON attorney_reviews(decision);