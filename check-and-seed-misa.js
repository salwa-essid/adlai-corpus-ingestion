// Checks whether misa's newly-ingested articles actually contain Arabic
// text this time, and if so, seeds the missing 'misa' eval_question
// (it was never seeded before because every misa article used to be
// 100% English).
const pool = require("./src/config/database");
const { createEvalQuestion } = require("./src/services/evalQuestionService");

function stripHeading(text) {
    const colonIndex = text.indexOf(":");
    return colonIndex === -1 ? text : text.slice(colonIndex + 1).trim();
}

(async () => {
    const { rows: sourceRows } = await pool.query(`SELECT id FROM sources WHERE code = 'MISA_INVESTMENT_LAW' LIMIT 1`);
    const sourceId = sourceRows[0].id;

    const { rows: docs } = await pool.query(
        `SELECT id FROM documents WHERE source_id = $1 AND superseded_by IS NULL LIMIT 1`,
        [sourceId]
    );
    const documentId = docs[0].id;

    const { rows: articles } = await pool.query(
        `SELECT article_number, text_ar FROM articles WHERE document_id = $1 ORDER BY ordering`,
        [documentId]
    );
    console.log(`misa latest document has ${articles.length} articles.`);
    for (const a of articles) {
        console.log(`  article ${a.article_number}: text_ar length=${(a.text_ar || "").length}, sample: ${JSON.stringify((a.text_ar || "").slice(0, 80))}`);
    }

    const { rows: existing } = await pool.query(
        `SELECT id FROM eval_questions WHERE version = 'v1' AND domain = 'misa' LIMIT 1`
    );
    if (existing.length > 0) {
        console.log("\nmisa already has a v1 eval_question, not adding another.");
        await pool.end();
        return;
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
        console.log("\nNo usable Arabic content found in misa articles — nothing seeded. (Still broken.)");
        await pool.end();
        return;
    }

    const { rows: idRow } = await pool.query(
        `SELECT id FROM articles WHERE document_id = $1 AND article_number = $2 LIMIT 1`,
        [documentId, picked.article_number]
    );

    await createEvalQuestion({
        version: "v1",
        domain: "misa",
        questionAr: words,
        expectedCitations: [idRow[0].id],
        attorneyRubric: "auto-generated content-based smoke-test (seeded 2026-08-04, first time misa had usable Arabic content) — needs attorney review before being trusted for the cutover gate (spec section 7)"
    });
    console.log(`\nSeeded [misa] question from article ${picked.article_number}: "${words.slice(0, 60)}..."`);

    await pool.end();
})();