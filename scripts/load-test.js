const fs = require("fs/promises");
const path = require("path");
const OUTPUT_DIR = path.join(__dirname, "..", "output");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const CLONE_PREFIX = "loadtest_clone_";
function parseArgs() {
    const args = process.argv.slice(2);
    let clonesPerSource = 10;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--clones-per-source") clonesPerSource = parseInt(args[++i], 10);
    }
    return { clonesPerSource };
}
function stubEmbeddings() {
    // Same fake-embedding approach as test/integration/ingestion.test.js:
    // deterministic per input text, no real network call, no API key
    // needed. What's being measured here is DB/pipeline throughput, not
    // Cohere's response time.
    global.fetch = async (_url, opts) => {
        const body = JSON.parse(opts.body);
        const embeddings = body.texts.map((_, i) =>
            new Array(1024).fill(0).map((_, j) => Math.sin(i * 97 + j) * 0.01)
        );
        return { ok: true, status: 200, json: async () => ({ embeddings }) };
    };
}
async function main() {
    const { clonesPerSource } = parseArgs();
    stubEmbeddings();
    const pool = require("../src/config/database");
    const { runPipeline } = require("../src/services/ingestionService");
    const originalManifestText = await fs.readFile(MANIFEST_PATH, "utf8");
    const originalManifest = JSON.parse(originalManifestText);
    const realSources = originalManifest.sources.filter((s) => s.status === "success");
    console.log(`[load-test] ${realSources.length} real source(s) found, cloning ${clonesPerSource}x each = ${realSources.length * clonesPerSource} synthetic sources.`);
    const cloneNames = [];
    let expectedArticles = 0;

    try {
        // ---- Build synthetic sources: copy each real source's already-
        // parsed articles into N clone JSON files under new names. ----
        for (const source of realSources) {
            const articlesText = await fs.readFile(path.join(OUTPUT_DIR, `${source.name}.json`), "utf8");
            const articles = JSON.parse(articlesText);
            for (let i = 1; i <= clonesPerSource; i++) {
                const cloneName = `${CLONE_PREFIX}${source.name}_${i}`;
                await fs.writeFile(path.join(OUTPUT_DIR, `${cloneName}.json`), articlesText);
                cloneNames.push({ name: cloneName, language: source.language, status: "success" });
                expectedArticles += articles.length;
            }
        }
        // Swap in a manifest containing ONLY the synthetic sources — the
        // real 11 sources are never touched by this run at all (no risk
        // of re-superseding real documents just from running the test).
        await fs.writeFile(MANIFEST_PATH, JSON.stringify({ sources: cloneNames }, null, 2));
        console.log(`[load-test] Starting ingestion of ${cloneNames.length} synthetic sources, ${expectedArticles} articles total...`);
        const startedAt = Date.now();
        await runPipeline({});
        const elapsedMs = Date.now() - startedAt;
        console.log(`\n[load-test] Ingestion finished in ${(elapsedMs / 1000).toFixed(1)}s.`);
        // ---- Verify ----
        const cloneSlugPattern = `${CLONE_PREFIX}%`;
        const sourceRows = await pool.query(`SELECT id FROM sources WHERE slug LIKE $1`, [cloneSlugPattern]);
        const articleRows = await pool.query(
            `SELECT count(*)::int AS n FROM articles WHERE document_id IN (SELECT id FROM documents WHERE source_id = ANY($1::uuid[]))`,
            [sourceRows.rows.map((r) => r.id)]
        );
        const chunkRows = await pool.query(
            `SELECT count(*)::int AS n FROM article_chunks WHERE article_id IN (SELECT id FROM articles WHERE document_id IN (SELECT id FROM documents WHERE source_id = ANY($1::uuid[])))`,
            [sourceRows.rows.map((r) => r.id)]
        );
        console.log(`[load-test] Verification: ${sourceRows.rows.length}/${cloneNames.length} sources created, ${articleRows.rows[0].n}/${expectedArticles} articles, ${chunkRows.rows[0].n} chunks.`);
        console.log(`[load-test] Throughput: ${(articleRows.rows[0].n / (elapsedMs / 1000)).toFixed(1)} articles/sec.`);
        if (sourceRows.rows.length !== cloneNames.length || articleRows.rows[0].n !== expectedArticles) {
            console.warn("[load-test] WARNING: counts don't match expectations — inspect before trusting the throughput number.");
        }
        // ---- Cleanup: remove every synthetic DB row. Same delete order
        // as test/integration/ingestion.test.js's test.after(), since
        // sources -> documents/ingestion_runs/document_diffs/
        // source_snapshots don't cascade. ----
        const sourceIds = sourceRows.rows.map((r) => r.id);
        if (sourceIds.length > 0) {
            await pool.query(`DELETE FROM articles WHERE document_id IN (SELECT id FROM documents WHERE source_id = ANY($1::uuid[]))`, [sourceIds]);
            await pool.query(`DELETE FROM document_diffs WHERE source_id = ANY($1::uuid[])`, [sourceIds]);
            await pool.query(`DELETE FROM source_snapshots WHERE source_id = ANY($1::uuid[])`, [sourceIds]);
            await pool.query(`DELETE FROM tenant_subscriptions WHERE source_id = ANY($1::uuid[])`, [sourceIds]);
            await pool.query(`DELETE FROM documents WHERE source_id = ANY($1::uuid[])`, [sourceIds]);
            await pool.query(`DELETE FROM ingestion_runs WHERE source_id = ANY($1::uuid[])`, [sourceIds]);
            await pool.query(`DELETE FROM sources WHERE id = ANY($1::uuid[])`, [sourceIds]);
        }
        console.log(`[load-test] Cleaned up ${sourceIds.length} synthetic source(s) and everything under them.`);
    } finally {
        // Always restore the real manifest and remove synthetic output
        // files, even if something above threw.
        await fs.writeFile(MANIFEST_PATH, originalManifestText);
        for (const clone of cloneNames) {
            await fs.rm(path.join(OUTPUT_DIR, `${clone.name}.json`), { force: true });
        }
        console.log(`[load-test] Restored output/manifest.json and removed ${cloneNames.length} synthetic output/*.json file(s).`);
        await pool.end();
    }
}
main().catch((err) => {
    console.error("[load-test] FAILED:", err);
    process.exit(1);
});