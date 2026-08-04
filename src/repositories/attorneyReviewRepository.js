const { withTenantContext } = require("../utils/tenantContext");
// attorney_reviews has RLS + FORCE ROW LEVEL SECURITY (migration 012), so
// every write needs app.current_tenant_id set on the same connection/
// transaction first — same as queryAuditRepository.js already does.
// Without this wrapper, the INSERT's WITH CHECK always fails (or throws
// an invalid-uuid cast, depending on what the pooled connection's
// app.current_tenant_id happened to be left at) — every review save
// fails, with no test currently catching it.
async function saveAttorneyReview(review) {
    return withTenantContext(review.tenantId, (client) => saveAttorneyReviewWithClient(client, review));
}
async function saveAttorneyReviewWithClient(client, review) {
    const query = `
        INSERT INTO attorney_reviews (
            tenant_id,
            query_id,
            reviewer_id,
            decision,
            reject_reason,
            edited_response,
            sla_deadline
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id;
    `
    const values = [
        review.tenantId,
        review.queryId,
        review.reviewerId,
        review.decision,
        review.rejectReason || null,
        review.editedResponse || null,
        review.slaDeadline || null
    ]
    const { rows } = await client.query(query, values)
    return rows[0].id
}
module.exports = {
    saveAttorneyReview
}