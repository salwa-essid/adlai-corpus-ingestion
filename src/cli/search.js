const { generateEmbedding } = require("../services/embeddingService");
const { searchByEmbedding } = require("../repositories/searchRepository");
const { auditQuery } = require("../services/queryAuditService");
const { getOrCreateDevTenant } = require("../repositories/tenantRepository");
const pool = require("../config/database");

function parseArguments() {
    const args = process.argv.slice(2);
    const options = {
        query: null,
        limit: 5
    };
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--query":
                options.query = args[++i];
                break;
            case "--limit":
                options.limit = parseInt(args[++i], 10);
                break;
        }
    }
    return options;
}
async function main() {
    const options = parseArguments();
    if (!options.query) {
        console.error('Usage: node src/cli/search.js --query "<text>" [--limit N]');
        process.exit(1);
    }
    try {
        console.log(`Searching for: "${options.query}"`);
        const startedAt = Date.now();
        const embedding = await generateEmbedding(options.query, "search_query");
        const results = await searchByEmbedding(embedding, options.limit);
        const latencyMs = Date.now() - startedAt;
        if (results.length === 0) {
            console.log("No results found.");
        } else {
            results.forEach((r, i) => {
                console.log(
                    `\n${i + 1}. [${r.source_code}] Article ${r.article_number} ` +
                    `(distance: ${Number(r.distance).toFixed(4)})`
                );
                console.log(`   ${r.chunk_text.slice(0, 150)}...`);
            });
        }
        // Log this retrieval per spec 4.4 (query_audit_log — every
        // retrieval + generation call). No real auth/tenant system
        // exists yet, so this logs against a placeholder dev tenant.
        const tenantId = await getOrCreateDevTenant();
        await auditQuery({
            tenantId,
            userId: null,
            queryText: options.query,
            retrievedChunkIds: results.map((r) => r.id),
            modelUsed: "embed-multilingual-v3.0",
            response: JSON.stringify(results.map((r) => r.id)),
            citationVerifierStatus: "pass",
            latencyMs
        });
    } catch (err) {
        console.error(err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();