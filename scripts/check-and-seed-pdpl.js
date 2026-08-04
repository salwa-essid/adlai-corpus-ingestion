// Same pattern as check-and-seed-misa.js: verify pdpl's new document
// actually has usable Arabic text, and seed the missing 'pdpl'
// eval_question if so.
const pool = require("../src/config/database");
const { createEvalQuestion } = require("../src/services/evalQuestionService");

function stripHeading(text) {
    const colonIndex = text.indexOf(":");
    return colonIndex === -1 ? text : text.slice(colonIndex + 1).trim();
}

(async () => {
    const { rows: sourceRows } = await pool.query(`SELECT id FROM sources WHERE code = 'PDPL' LIMIT 1`);
    const sourceId = sourceRows[0].id;

    const { rows: docs } = await pool.query(
        `SELECT id FROM documents WHERE source_id = $1 AND superseded_by IS NULL LIMIT 1`,
        [sourceId]
    );
    const documentId = docs[0].id;

    const { rows: articles } = await pool.query(
        `SELECT id, article_number, text_ar FROM articles WHERE document_id = $1 ORDER BY ordering`,
        [documentId]
    );
    console.log(`pdpl latest document has ${articles.length} articles.`);
    for (const a of articles.slice(0, 5)) {
        console.log(`  article ${a.article_number}: text_ar length=${(a.text_ar || "").length}, sample: ${JSON.stringify((a.text_ar || "").slice(0, 80))}`);
    }

    const { rows: existing } = await pool.query(
        `SELECT id FROM eval_questions WHERE version = 'v1' AND domain = 'pdpl' LIMIT 1`
    );
    if (existing.length > 0) {
        console.log("\npdpl already has a v1 eval_question — deleting it first (it's the old broken one).");
        await pool.query(`DELETE FROM eval_questions WHERE version = 'v1' AND domain = 'pdpl'`);
    }

    let picked = null, words = "";
    for (const article of articles) {
        const raw = article.text_ar || "";
        if (raw.length < 20) continue;
        const content = stripHeading(raw);
        const candidateWords = content.split(/\s+/).filter(Boolean).slice(0, 15).join(" ");
        if (candidateWords.length > 20) {
            picked = article;
            words = candidateWords;
            break;
        }
    }

    if (!picked) {
        console.log("\nNo usable Arabic content found in pdpl articles — nothing seeded. (Still broken.)");
        await pool.end();
        return;
    }

    await createEvalQuestion({
        version: "v1",
        domain: "pdpl",
        questionAr: words,
        expectedCitations: [picked.id],
        attorneyRubric: "auto-generated content-based smoke-test (seeded 2026-08-04, first time pdpl had a genuine Arabic source) — needs attorney review before being trusted for the cutover gate (spec section 7)"
    });
    console.log(`\nSeeded [pdpl] question from article ${picked.article_number}: "${words.slice(0, 60)}..."`);

    await pool.end();
})();