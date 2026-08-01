const pool = require("../config/database");

async function saveAttorneyReview(review) {
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
    const { rows } = await pool.query(query, values)
    return rows[0].id
}
module.exports = {
    saveAttorneyReview
}