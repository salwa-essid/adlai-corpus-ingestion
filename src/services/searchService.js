const { generateEmbedding } = require("./embeddingService");
const { normalizeArabic } = require("./normalizationService");
const { searchHybrid } = require("../repositories/searchRepository");
const { auditQuery } = require("./queryAuditService");
const {
    getOrCreateDevTenant
} = require("../repositories/tenantRepository");

async function search(query, limit = 5) {
    const startedAt = Date.now();
    const embedding = await generateEmbedding(
        query,
        "search_query"
    );
    const normalizedQuery = normalizeArabic(query);
    const results = await searchHybrid(
        embedding,
        normalizedQuery,
        limit
    );
    const latencyMs = Date.now() - startedAt;
    const tenantId = await getOrCreateDevTenant();
    await auditQuery({
        tenantId,
        userId: null,
        queryText: query,
        retrievedChunkIds: results.map(r => r.id),
        modelUsed:
            "embed-multilingual-v3.0 + tsvector (hybrid)",
        response: JSON.stringify(
            results.map(r => r.id)
        ),
        citationVerifierStatus: "pass",
        latencyMs
    });
    return results;
}

module.exports = {
    search
};