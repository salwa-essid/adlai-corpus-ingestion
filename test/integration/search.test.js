const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const originalCwd = process.cwd();
let dbAvailable = false;
let pool;
let sourceId;

const TEST_SLUG = "test_search_svc_source";
const ARTICLE_TEXT = "المادة الأولى: يعرف هذا النظام بنظام ضريبة القيمة المضافة.";

test.before(async () => {
    // Stub the embedding provider so this test never makes a real network
    // call to Cohere — same pattern as test/integration/ingestion.test.js.
    // Without this, `npm test` needed a live COHERE_API_KEY + network
    // access just to run, and would burn a real API call every run.
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
        return;
    }

    // Seed our own article/chunk instead of relying on rows left behind by
    // ingestion.test.js — this test no longer depends on file run order or
    // on another test's fixture data still being in the DB.
    const { normalizeArabic } = require(path.join(originalCwd, "src/services/normalizationService"));

    const source = await pool.query(
        `INSERT INTO sources (slug, code, type, jurisdiction)
         VALUES ($1, 'TEST_SEARCH_SVC_SOURCE', 'statute', 'SA')
         ON CONFLICT (slug) DO UPDATE SET code = EXCLUDED.code
         RETURNING id`,
        [TEST_SLUG]
    );
    sourceId = source.rows[0].id;

    const doc = await pool.query(
        `INSERT INTO documents (source_id, version, source_hash, language)
         VALUES ($1, 'v1', $2, 'ar') RETURNING id`,
        [sourceId, `hash-${TEST_SLUG}`]
    );

    const normalized = normalizeArabic(ARTICLE_TEXT);
    const article = await pool.query(
        `INSERT INTO articles (document_id, article_number, ordering, text_ar, text_ar_normalized)
         VALUES ($1, '1', 1, $2, $3) RETURNING id`,
        [doc.rows[0].id, ARTICLE_TEXT, normalized]
    );

    const embeddingLiteral = `[${new Array(1024).fill(0).map((_, j) => Math.sin(97 + j) * 0.01).join(",")}]`;
    await pool.query(
        `INSERT INTO article_chunks (article_id, chunk_index, chunk_text, embedding_model, embedding_ar)
         VALUES ($1, 0, $2, 'test-stub', $3::vector)`,
        [article.rows[0].id, ARTICLE_TEXT, embeddingLiteral]
    );
});

test.after(async () => {
    if (dbAvailable && sourceId) {
        await pool.query(
            `DELETE FROM articles WHERE document_id IN (SELECT id FROM documents WHERE source_id = $1)`,
            [sourceId]
        );
        await pool.query(`DELETE FROM documents WHERE source_id = $1`, [sourceId]);
        await pool.query(`DELETE FROM sources WHERE id = $1`, [sourceId]);
    }
    if (pool) await pool.end();
});

test("Hybrid search should return relevant results", async (t) => {
    if (!dbAvailable) {
        t.skip("Postgres not reachable — run `docker compose up -d && npm run migrate` first");
        return;
    }
    const { search } = require(path.join(originalCwd, "src/services/searchService"));
    const results = await search("المادة الأولى", 5);
    assert.ok(results.length > 0);
    for (const result of results) {
        assert.ok(result.id);
        assert.ok(result.article_id);
        assert.ok(result.article_number);
        assert.ok(result.source_code);
        assert.ok(result.chunk_text);
        assert.ok(result.score > 0);
    }
});