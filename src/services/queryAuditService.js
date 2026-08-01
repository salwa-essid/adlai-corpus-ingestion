const crypto = require("crypto");
const {
    saveQueryAudit
} = require("../repositories/queryAuditRepository");
function sha256(text) {
    return crypto
        .createHash("sha256")
        .update(text)
        .digest("hex");
}
async function auditQuery(data) {
    return saveQueryAudit({
        tenantId: data.tenantId,
        userId: data.userId,
        queryHash: sha256(data.queryText),
        queryText: data.queryText,
        retrievedChunkIds: data.retrievedChunkIds,
        modelUsed: data.modelUsed,
        responseHash: sha256(data.response),
        citationVerifierStatus:
        data.citationVerifierStatus,
        latencyMs: data.latencyMs
    })
}

module.exports = {
    auditQuery
}