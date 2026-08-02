-- ==========================================
-- TENANT SUBSCRIPTIONS
-- ==========================================

CREATE TABLE IF NOT EXISTS tenant_subscriptions (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL
    REFERENCES tenants(id)
    ON DELETE CASCADE,
    source_id UUID NOT NULL
    REFERENCES sources(id)
    ON DELETE CASCADE,

    subscribed_at TIMESTAMPTZ DEFAULT NOW()

    );

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant
    ON tenant_subscriptions(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_source
    ON tenant_subscriptions(source_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_subscriptions_unique
    ON tenant_subscriptions(tenant_id, source_id);