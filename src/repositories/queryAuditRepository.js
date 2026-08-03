const pool = require("../config/database");
const { withTenantContext } = require("../utils/tenantContext");

async function saveQueryAudit(log) {
    return withTenantContext(log.tenantId, async (client) => {
        const query = `
            INSERT INTO query_audit_log (
                tenant_id,
                user_id,
                query_hash,
                query_text,
                retrieved_chunk_ids,
                model_used,
                response_hash,
                citation_verifier_status,
                latency_ms
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING id;
        `;
        const values = [
            log.tenantId,
            log.userId || null,
            log.queryHash,
            log.queryText,
            log.retrievedChunkIds || [],
            log.modelUsed,
            log.responseHash,
            log.citationVerifierStatus,
            log.latencyMs
        ];
        const { rows } = await client.query(query, values);
        return rows[0].id;
    });
}
module.exports = {
    saveQueryAudit
};