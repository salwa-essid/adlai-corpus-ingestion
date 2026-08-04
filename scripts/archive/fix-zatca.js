// Fixes the 3 zatca sources whose LATEST document has 0 articles (same
// root cause as companies: the insert transaction rolled back, most
// likely a transient Cohere embeddings API error). For each one:
//   1. re-run saveArticles directly on the existing latest document
//   2. delete the stale eval_question that points at an old/superseded
//      article for that source
//   3. seed a fresh eval_question from the now-populated latest document
const fs = require("fs");
const pool = require("../src/config/database");
const { saveArticles } = require("../src/repositories/articleRepository");
const { createEvalQuestion } = require("../src/services/evalQuestionService");

function stripHeading(text) {
    const colonIndex = text.indexOf(":");
    return colonIndex === -1 ? text : text.slice(colonIndex + 1).trim();
}

const TARGETS = [
    { code: "ZATCA_IMPLEMENTATION_RESOLUTION", jsonFile: "zatca_implementation_resolution.json" },
    { code: "ZATCA_GUIDELINES", jsonFile: "zatca_guidelines.json" },
    { code: "ZATCA_VAT_AGREEMENT", jsonFile: "zatca_vat_agreement.json" }
];

(async () => {
    for (const target of TARGETS) {
        console.log(`\n=== ${target.code} ===`);

        const { rows: sourceRows } = await pool.query(`SELECT id FROM sources WHERE code = $1 LIMIT 1`, [target.code]);
        if (sourceRows.length === 0) {
            console.log("  source not found, skipping.");
            continue;
        }
        const sourceId = sourceRows[0].id;

        const { rows: docs } = await pool.query(
            `SELECT id FROM documents WHERE source_id = $1 AND superseded_by IS NULL LIMIT 1`,
            [sourceId]
        );
        if (docs.length === 0) {
            console.log("  no latest document found, skipping.");
            continue;
        }
        const documentId = docs[0].id;

        const articles = JSON.parse(fs.readFileSync(`./output/${target.jsonFile}`, "utf-8"));
        console.log(`  saving ${articles.length} articles into document ${documentId}...`);
        try {
            await saveArticles(documentId, articles);
            console.log("  articles saved OK.");
        } catch (error) {
            console.log("  FAILED to save articles:", error.message);
            continue; // don't touch eval_questions if articles didn't save
        }

        // Delete the stale question(s) pointing at articles from a
        // NON-latest document of this same source.
        const del = await pool.query(
            `DELETE FROM eval_questions
             WHERE version = 'v1' AND domain = 'zatca'
               AND (expected_citations->>0)::uuid IN (
                   SELECT a.id FROM articles a
                   JOIN documents d ON d.id = a.document_id
                   WHERE d.source_id = $1 AND d.id != $2
               )
             RETURNING id`,
            [sourceId, documentId]
        );
        console.log(`  deleted ${del.rowCount} stale question(s) for this source.`);

        const { rows: newArticles } = await pool.query(
            `SELECT id, article_number, text_ar FROM articles WHERE document_id = $1 ORDER BY ordering LIMIT 15`,
            [documentId]
        );
        let picked = null, words = "";
        for (const article of newArticles) {
            const content = stripHeading(article.text_ar || "");
            const candidateWords = content.split(/\s+/).filter(Boolean).slice(0, 15).join(" ");
            if (candidateWords.length > 20) {
                picked = article;
                words = candidateWords;
                break;
            }
        }
        if (!picked) {
            console.log("  no usable article found to seed a question.");
            continue;
        }
        await createEvalQuestion({
            version: "v1",
            domain: "zatca",
            questionAr: words,
            expectedCitations: [picked.id],
            attorneyRubric: "auto-generated content-based smoke-test (re-seeded 2026-08-03 after fixing empty-document bug) — needs attorney review before being trusted for the cutover gate (spec section 7)"
        });
        console.log(`  seeded question from article ${picked.article_number}: "${words.slice(0, 60)}..."`);
    }

    await pool.end();
})();
