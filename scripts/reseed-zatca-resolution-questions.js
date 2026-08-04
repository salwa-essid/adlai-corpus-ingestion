// zatca_implementation_resolution just got a new document version (101
// properly-split articles, replacing the old ~2-giant-blob version).
// Its existing eval_questions still cite articles from the OLD,
// superseded document — same stale-citation pattern we fixed for
// labor/companies/vat_agreement earlier today. Delete those and reseed
// fresh ones from the new document.
const pool = require("../src/config/database");
const { createEvalQuestion } = require("../src/services/evalQuestionService");

function stripHeading(text) {
    const colonIndex = text.indexOf(":");
    return colonIndex === -1 ? text : text.slice(colonIndex + 1).trim();
}

(async () => {
    const { rows: sourceRows } = await pool.query(`SELECT id FROM sources WHERE code = 'ZATCA_IMPLEMENTATION_RESOLUTION' LIMIT 1`);
    const sourceId = sourceRows[0].id;

    const { rows: docs } = await pool.query(
        `SELECT id FROM documents WHERE source_id = $1 AND superseded_by IS NULL LIMIT 1`,
        [sourceId]
    );
    const documentId = docs[0].id;

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
    console.log(`Deleted ${del.rowCount} stale question(s) citing the old document.`);

    const { rows: articles } = await pool.query(
        `SELECT id, article_number, text_ar FROM articles WHERE document_id = $1 ORDER BY ordering`,
        [documentId]
    );

    const candidates = articles.filter(a => {
        const raw = a.text_ar || "";
        if (!raw.includes(":")) return false;
        const content = stripHeading(raw);
        return content.split(/\s+/).filter(Boolean).length >= 15;
    });

    // Seed 3 questions spread across the document (matches the "3 per
    // domain-source" density we used in expand-eval-questions.js).
    const count = Math.min(3, candidates.length);
    const step = Math.max(1, Math.floor(candidates.length / count));
    let seeded = 0;
    for (let i = 0; i < count; i++) {
        const article = candidates[Math.min(i * step, candidates.length - 1)];
        const content = stripHeading(article.text_ar);
        const words = content.split(/\s+/).filter(Boolean).slice(0, 15).join(" ");
        await createEvalQuestion({
            version: "v1",
            domain: "zatca",
            questionAr: words,
            expectedCitations: [article.id],
            attorneyRubric: "auto-generated content-based smoke-test (re-seeded 2026-08-04 after fixing article-splitting bug) — needs attorney review before being trusted for the cutover gate (spec section 7)"
        });
        console.log(`Seeded article ${article.article_number}: "${words.slice(0, 60)}..."`);
        seeded++;
    }
    console.log(`\nTotal seeded: ${seeded}`);

    await pool.end();
})();3