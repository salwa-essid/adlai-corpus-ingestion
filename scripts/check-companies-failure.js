// Same diagnostic pattern as check-zatca-question.js: find the companies
// question that failed in the last eval run and show what got retrieved
// instead of the expected article.
const pool = require("../src/config/database");
const { searchHybrid } = require("../src/repositories/searchRepository");
const { generateEmbedding } = require("../src/services/embeddingService");
const { normalizeArabic } = require("../src/services/normalizationService");

(async () => {
    const { rows: runs } = await pool.query(
        `SELECT id, results_summary FROM eval_runs WHERE eval_version = 'v1' ORDER BY run_at DESC LIMIT 1`
    );
    const summary = runs[0].results_summary;
    const companiesResults = summary.perQuestion.filter(p => p.domain === "companies");
    console.log("companies question results from last eval run:");
    for (const r of companiesResults) {
        console.log(`  question ${r.questionId}: recall=${r.recall}, hits=${r.hits}`);
    }

    const failed = companiesResults.find(r => r.recall === 0);
    if (!failed) {
        console.log("\nNo failing companies question found (may have changed since).");
        await pool.end();
        return;
    }

    console.log(`\n=== Investigating failed question ${failed.questionId} ===`);
    const { rows: qRows } = await pool.query(`SELECT * FROM eval_questions WHERE id = $1`, [failed.questionId]);
    const q = qRows[0];
    console.log("question_ar:", q.question_ar);

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
        console.log(`  - source=${art?.code} article_number=${art?.article_number}`);
        console.log(`    text: ${JSON.stringify((art?.text_ar || "").slice(0, 100))}`);
    }

    const { rows: expectedArt } = await pool.query(
        `SELECT article_number, text_ar FROM articles WHERE id = $1`,
        [q.expected_citations[0]]
    );
    console.log("\nExpected article was:");
    console.log(" article_number:", expectedArt[0]?.article_number);
    console.log(" text:", JSON.stringify((expectedArt[0]?.text_ar || "").slice(0, 200)));

    await pool.end();
})();
