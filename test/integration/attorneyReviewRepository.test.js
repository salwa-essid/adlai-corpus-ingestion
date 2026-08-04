const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const originalCwd = process.cwd();
let dbAvailable = false;
let pool;
let tenantAId;
let tenantBId;
let queryId;
test.before(async () => {
    pool = require(path.join(originalCwd, "src/config/database"));
    try {
        await pool.query("SELECT 1");
        dbAvailable = true;
    } catch {
        dbAvailable = false;
        return;
    }
    const { withTenantContext } = require(path.join(originalCwd, "src/utils/tenantContext"));
    const tenantA = await pool.query(
        `INSERT INTO tenants (name, data_residency) VALUES ('Test Attorney Review Tenant A', 'standard') RETURNING id`
    );
    tenantAId = tenantA.rows[0].id;
    const tenantB = await pool.query(
        `INSERT INTO tenants (name, data_residency) VALUES ('Test Attorney Review Tenant B', 'standard') RETURNING id`
    );
    tenantBId = tenantB.rows[0].id;
    // Seed the query_audit_log row the review will point to, via the same
    // withTenantContext path real traffic uses (queryAuditRepository.js) —
    // this also leaves the pooled connection's app.current_tenant_id set
    // to tenant A afterward, same as it would be after a real search
    // request, so the test below exercises the real failure condition.
    const qa = await withTenantContext(tenantAId, (client) =>
        client.query(
            `INSERT INTO query_audit_log (tenant_id, query_hash, query_text, retrieved_chunk_ids, model_used, response_hash, citation_verifier_status, latency_ms)
             VALUES ($1, 'test-hash', 'test query', ARRAY[]::uuid[], 'test-model', 'test-resp-hash', 'pass', 5)
             RETURNING id`,
            [tenantAId]
        )
    );
    queryId = qa.rows[0].id;
});
test.after(async () => {
    if (dbAvailable && tenantAId) {
        await pool.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [tenantAId, tenantBId]); // cascades attorney_reviews/query_audit_log
    }
    if (pool) await pool.end();
});
test("saveAttorneyReview: saves successfully under RLS (regression test — used to always throw)", async (t) => {
    if (!dbAvailable) {
        t.skip("Postgres not reachable — run `docker compose up -d && npm run migrate` first");
        return;
    }
    const { saveAttorneyReview } = require(path.join(originalCwd, "src/repositories/attorneyReviewRepository"));
    const { withTenantContext } = require(path.join(originalCwd, "src/utils/tenantContext"));
    const reviewId = await saveAttorneyReview({
        tenantId: tenantAId,
        queryId,
        reviewerId: "11111111-1111-1111-1111-111111111111",
        decision: "approve",
        rejectReason: null,
        editedResponse: null,
        slaDeadline: null
    });
    assert.ok(reviewId, "saveAttorneyReview should return the new row's id instead of throwing");
    // attorney_reviews has FORCE RLS on every command, not just INSERT — a
    // plain pool.query() here (no tenant context) would fail the same way
    // saveAttorneyReview used to, so the read also goes through
    // withTenantContext, same as real app code would.
    const { rows } = await withTenantContext(tenantAId, (client) =>
        client.query(`SELECT decision, tenant_id FROM attorney_reviews WHERE id = $1`, [reviewId])
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].decision, "approve");
    assert.equal(rows[0].tenant_id, tenantAId);
});
test("saveAttorneyReview: the saved row is isolated by RLS — not visible from another tenant's context", async (t) => {
    if (!dbAvailable) {
        t.skip("Postgres not reachable");
        return;
    }
    const { saveAttorneyReview } = require(path.join(originalCwd, "src/repositories/attorneyReviewRepository"));
    const { withTenantContext } = require(path.join(originalCwd, "src/utils/tenantContext"));
    const reviewId = await saveAttorneyReview({
        tenantId: tenantAId,
        queryId,
        reviewerId: "11111111-1111-1111-1111-111111111111",
        decision: "reject",
        rejectReason: "not confident in citation",
        editedResponse: null,
        slaDeadline: null
    });
    const asTenantB = await withTenantContext(tenantBId, (client) =>
        client.query(`SELECT id FROM attorney_reviews WHERE id = $1`, [reviewId])
    );
    assert.equal(asTenantB.rows.length, 0, "tenant B must not see tenant A's attorney review row");
});