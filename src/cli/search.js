const { generateEmbedding } = require("../services/embeddingService");
const { searchHybrid } = require("../repositories/searchRepository");
const { auditQuery } = require("../services/queryAuditService");
const { getOrCreateDevTenant } = require("../repositories/tenantRepository");
const { normalizeArabic } = require("../services/normalizationService");
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
        // Sparse side matches against text_ar_tsv, which was built from
        // text_ar_normalized — so the query needs the same normalization
        // (diacritic stripping etc.) to actually match. Postgres's
        // unaccent() alone doesn't strip Arabic tashkil (see
        // normalizationService.js), so this uses our own normalizer.
        const normalizedQuery = normalizeArabic(options.query);
        const results = await searchHybrid(embedding, normalizedQuery, options.limit);
        const latencyMs = Date.now() - startedAt;
        if (results.length === 0) {
            console.log("No results found.");
        } else {
            results.forEach((r, i) => {
                console.log(
                    `\n${i + 1}. [${r.source_code}] Article ${r.article_number} ` +
                    `(score: ${Number(r.score).toFixed(4)})`
                );
                console.log(`   ${r.chunk_text.slice(0, 150)}...`);
            });
        }
        const tenantId = await getOrCreateDevTenant();
        await auditQuery({
            tenantId,
            userId: null,
            queryText: options.query,
            retrievedChunkIds: results.map((r) => r.id),
            modelUsed: "embed-multilingual-v3.0 + tsvector (hybrid)",
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