const pool = require("./src/config/database");
const { createEvalQuestion } = require("./src/services/evalQuestionService");

(async () => {
    // Grab a real article to cite as the "correct" answer.
    const { rows } = await pool.query(`
        SELECT a.id, a.article_number, s.code
        FROM articles a
        JOIN documents d ON d.id = a.document_id
        JOIN sources s ON s.id = d.source_id
        WHERE s.code = 'COMPANIES_LAW'
        ORDER BY a.ordering
        LIMIT 1;
    `);

    if (rows.length === 0) {
        console.log("No COMPANIES_LAW articles found — ingest that source first.");
        process.exit(1);
    }

    const article = rows[0];
    console.log("Using article:", article);

    await createEvalQuestion({
        version: "v1",
        domain: "companies",
        questionAr: "ما هو تعريف الشركة في نظام الشركات؟",
        expectedCitations: [article.id],
        attorneyRubric: "smoke-test question, seeded manually"
    });

    console.log("Seeded 1 eval_question.");
    await pool.end();
})();