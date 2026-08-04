// Deletes the stale v1 eval_question for LABOR_LAW (it was generated from
// the OLD mirror-reversed text, before the reverseText fix) and creates a
// fresh one from the now-corrected article text.
const pool = require("../src/config/database");
const { createEvalQuestion } = require("../src/services/evalQuestionService");

function stripHeading(text) {
    const colonIndex = text.indexOf(":");
    return colonIndex === -1 ? text : text.slice(colonIndex + 1).trim();
}

(async () => {
    const { rows: sourceRows } = await pool.query(
        `SELECT id FROM sources WHERE code = 'LABOR_LAW' LIMIT 1`
    );
    if (sourceRows.length === 0) {
        console.log("No LABOR_LAW source found — nothing to do.");
        await pool.end();
        return;
    }
    const sourceId = sourceRows[0].id;

    const deleted = await pool.query(
        `DELETE FROM eval_questions WHERE version = 'v1' AND domain = 'labor' RETURNING id`
    );
    console.log(`Deleted ${deleted.rowCount} stale labor v1 question(s).`);

    // IMPORTANT: filter to the LATEST (non-superseded) document version.
    // Without this, a source with multiple ingested versions (e.g. labor,
    // re-ingested after the reverseText fix) returns rows from BOTH the
    // old and new document — and since "ordering" restarts at 1 for each
    // version, "ORDER BY a.ordering" alone can silently grab the OLD,
    // still-garbled article 1 instead of the fixed one. This is exactly
    // what happened on the first run of this script.
    const { rows: articles } = await pool.query(
        `SELECT a.id, a.article_number, a.text_ar
         FROM articles a
         JOIN documents d ON d.id = a.document_id
         WHERE d.source_id = $1
           AND d.superseded_by IS NULL
         ORDER BY a.ordering
         LIMIT 15;`,
        [sourceId]
    );

    let picked = null;
    let words = "";
    for (const article of articles) {
        const content = stripHeading(article.text_ar || "");
        const candidateWords = content.split(/\s+/).filter(Boolean).slice(0, 15).join(" ");
        if (candidateWords.length > 20) {
            picked = article;
            words = candidateWords;
            break;
        }
    }

    if (!picked) {
        console.log("No usable LABOR_LAW article found — nothing seeded.");
        await pool.end();
        return;
    }

    await createEvalQuestion({
        version: "v1",
        domain: "labor",
        questionAr: words,
        expectedCitations: [picked.id],
        attorneyRubric: "auto-generated content-based smoke-test (re-seeded 2026-08-03 after reverseText fix) — needs attorney review before being trusted for the cutover gate (spec section 7)"
    });
    console.log(`Re-seeded [labor] article ${picked.article_number}: "${words.slice(0, 60)}..."`);

    await pool.end();
})();
