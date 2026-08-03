-- ==========================================
-- ROW LEVEL SECURITY (spec section 3)
--
-- Applied to query_audit_log and attorney_reviews: real per-tenant,
-- app-facing data where a leaked cross-tenant row is a real privacy
-- problem.
--
-- NOT applied to tenant_subscriptions: AI Watch (src/cli/watch.js)
-- legitimately needs to read subscriptions ACROSS all tenants to fan
-- out notifications — that's a system-level job, not a per-tenant
-- app request, and there's no separate privileged DB role yet to
-- carve out that exception cleanly. Revisit once AI Watch runs under
-- its own role.
--
-- FORCE ROW LEVEL SECURITY is required in addition to ENABLE: by
-- default Postgres exempts the table owner from RLS, and the app
-- almost always connects as the owner in a single-role dev setup like
-- this one. Without FORCE, the policy below would silently do nothing.
-- ==========================================

ALTER TABLE query_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_query_audit_log ON query_audit_log
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE attorney_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE attorney_reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_attorney_reviews ON attorney_reviews
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);