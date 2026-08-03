const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");
const originalCwd = process.cwd();
let dbAvailable = false;
let pool;
test.before(async () => {
    // Stub the embedding provider before anything requires embeddingService,
    // so no real network call to Cohere ever happens in this test run.
    global.fetch = async (_url, opts) => {
        const body = JSON.parse(opts.body);
        const embeddings = body.texts.map((_, i) =>
            new Array(1024).fill(0).map((_, j) => Math.sin(i * 97 + j) * 0.01)
        );
        return { ok: true, status: 200, json: async () => ({ embeddings }) };
    };

    pool = require(path.join(originalCwd, "src/config/database"));
    try {
        await pool.query("SELECT 1");
        dbAvailable = true;
    } catch {
        dbAvailable = false;
    }
});

test.after(async () => {
    if (dbAvailable) {
        // Only articles.id -> article_chunks/cross_references cascade
        // (ON DELETE CASCADE in migration 001/003). documents -> articles
        // and sources -> ingestion_runs/documents do NOT cascade, so those
        // need to be deleted explicitly, children first.
        const { rows } = await pool.query(
            `SELECT id FROM sources WHERE slug = 'test_source'`
        );
        const sourceId = rows[0]?.id;
        if (sourceId) {
            await pool.query(
                `DELETE FROM articles WHERE document_id IN (SELECT id FROM documents WHERE source_id = $1)`,
                [sourceId]
            );
            await pool.query(`DELETE FROM document_diffs WHERE source_id = $1`, [sourceId]);
            await pool.query(`DELETE FROM source_snapshots WHERE source_id = $1`, [sourceId]);
            await pool.query(`DELETE FROM tenant_subscriptions WHERE source_id = $1`, [sourceId]);
            await pool.query(`DELETE FROM documents WHERE source_id = $1`, [sourceId]);
            await pool.query(`DELETE FROM ingestion_runs WHERE source_id = $1`, [sourceId]);
            await pool.query(`DELETE FROM sources WHERE id = $1`, [sourceId]);
        }
    }
    if (pool) await pool.end();
});
test("ingestion pipeline: fixture end-to-end (row counts, chunk counts, cross-references)", async (t) => {
    if (!dbAvailable) {
        t.skip("Postgres not reachable — run `docker compose up -d && npm run migrate` first");
        return;
    }
    const { runPipeline } = require(path.join(originalCwd, "src/services/ingestionService"));
    process.chdir(FIXTURES_DIR);
    try {
        await runPipeline({ source: "test_source" });
    } finally {
        process.chdir(originalCwd);
    }
    const source = await pool.query(
        `SELECT id, code FROM sources WHERE slug = 'test_source'`
    );
    assert.equal(source.rows.length, 1, "source row should be created");
    assert.equal(source.rows[0].code, "TEST_SOURCE");
    const documents = await pool.query(
        `SELECT id FROM documents WHERE source_id = $1`,
        [source.rows[0].id]
    );
    assert.equal(documents.rows.length, 1, "exactly one document version created");
    const articles = await pool.query(
        `SELECT id, article_number FROM articles WHERE document_id = $1 ORDER BY ordering`,
        [documents.rows[0].id]
    );
    assert.equal(articles.rows.length, 3, "fixture has 3 articles");
    const chunks = await pool.query(
        `SELECT id, embedding_ar FROM article_chunks WHERE article_id = ANY($1::uuid[])`,
        [articles.rows.map((a) => a.id)]
    );
    // article 1 (short) -> 1 chunk, article 2 (short) -> 1 chunk,
    // article 3 (~704 tokens, > 512) -> splits into 2 chunks (512 + 242
    // with 50-token overlap). Total = 4.
    assert.equal(chunks.rows.length, 4, "chunking rule (512 tokens / 50 overlap) should produce 4 chunks");
    for (const chunk of chunks.rows) {
        assert.ok(chunk.embedding_ar, "every chunk should have an embedding stored");
    }
    const crossRefs = await pool.query(
        `SELECT from_article_id, to_article_id, extracted_by
         FROM cross_references
         WHERE from_article_id = ANY($1::uuid[])`,
        [articles.rows.map((a) => a.id)]
    );
    // Article 2 cites "المادة الأولى" (article 1) mid-sentence, not as a
    // heading -> exactly one rule-extracted cross-reference. Article 1's
    // own "المادة الأولى:" is a heading (colon right after) and must NOT
    // be picked up as a self-citation.
    assert.equal(crossRefs.rows.length, 1, "exactly one real citation, heading excluded");
    assert.equal(crossRefs.rows[0].extracted_by, "rule");
    assert.equal(crossRefs.rows[0].from_article_id, articles.rows[1].id); // article "2"
    assert.equal(crossRefs.rows[0].to_article_id, articles.rows[0].id); // article "1"
    const run = await pool.query(
        `SELECT status, articles_created FROM ingestion_runs WHERE source_id = $1 ORDER BY started_at DESC LIMIT 1`,
        [source.rows[0].id]
    );
    assert.equal(run.rows[0].articles_created, 3);
});

test("ingestion pipeline: re-running on unchanged fixture is a no-op (idempotency, spec 6.3)", async (t) => {
    if (!dbAvailable) {
        t.skip("Postgres not reachable");
        return;
    }
    const { runPipeline } = require(path.join(originalCwd, "src/services/ingestionService"));
    const before = await pool.query(`SELECT count(*)::int AS n FROM documents`);
    process.chdir(FIXTURES_DIR);
    try {
        await runPipeline({ source: "test_source" });
    } finally {
        process.chdir(originalCwd);
    }
    const after = await pool.query(`SELECT count(*)::int AS n FROM documents`);
    assert.equal(after.rows[0].n, before.rows[0].n, "unchanged source_hash should not create a new document version");
});