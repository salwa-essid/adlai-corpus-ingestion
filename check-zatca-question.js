// Finds which of the 4 zatca eval_questions failed in the LAST eval run,
// then manually re-runs retrieval for that one question so we can see
// exactly what got retrieved instead of the expected article.
const pool = require("./src/config/database");
const { searchHybrid } = require("./src/repositories/searchRepository");
const { generateEmbedding } = require("./src/services/embeddingService");
const { normalizeArabic } = require("./src/services/normalizationService");

(async () => {
    const { rows: runs } = await pool.query(
        `SELECT id, results_summary FROM eval_runs WHERE eval_version = 'v1' ORDER BY run_at DESC LIMIT 1`
    );
    if (runs.length === 0) {
        console.log("No eval runs found.");
        await pool.end();
        return;
    }
    const summary = runs[0].results_summary;
    const zatcaResults = summary.perQuestion.filter(p => p.domain === "zatca");
    console.log("zatca question results from last eval run:");
    for (const r of zatcaResults) {
        console.log(`  question ${r.questionId}: recall=${r.recall}, hits=${r.hits}`);
    }

    const failed = zatcaResults.find(r => r.recall === 0);
    if (!failed) {
        console.log("\nNo failing zatca question found in the last run (may have changed since).");
        await pool.end();
        return;
    }

    console.log(`\n=== Investigating failed question ${failed.questionId} ===`);
    const { rows: qRows } = await pool.query(`SELECT * FROM eval_questions WHERE id = $1`, [failed.questionId]);
    const q = qRows[0];
    console.log("question_ar:", q.question_ar);
    console.log("expected_citations:", q.expected_citations);

    const queryText = q.question_ar || q.question_en || "";
    const embedding = await generateEmbedding(queryText, "search_query");
    const searchText = normalizeArabic(queryText);
    const results = await searchHybrid(embedding, searchText, 3, 40);

    console.log("\nTop 3 retrieved instead:");
    for (const r of results) {
        const { rows: artRows } = await pool.query(
            `SELECT a.article_number, s.code, a.text_ar FROM articles a
             JOIN documents d ON d.id = a.document_id
             JOIN sources s ON s.id = d.source_id
             WHERE a.id = $1`,
            [r.article_id]
        );
        const art = artRows[0];
        console.log(`  - article_id=${r.article_id} source=${art?.code} article_number=${art?.article_number}`);
        console.log(`    text: ${JSON.stringify((art?.text_ar || "").slice(0, 100))}`);
    }

    const { rows: expectedArt } = await pool.query(
        `SELECT a.article_number, s.code, a.text_ar FROM articles a
         JOIN documents d ON d.id = a.document_id
         JOIN sources s ON s.id = d.source_id
         WHERE a.id = $1`,
        [q.expected_citations[0]]
    );
    console.log("\nExpected article was:");
    console.log(" ", expectedArt[0]);

    await pool.end();
})();