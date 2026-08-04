// The auto-picked VAT_AGREEMENT question came from article 1, which is
// just the generic preamble/chapter-title text ("Chapter One: Definitions
// and General Provisions") — a phrase common to many Saudi legal texts,
// so retrieval confuses it with companies law. Re-seed with a LATER
// article that has real, specific content (requires a colon, i.e. an
// actual "Article N: <definition text>" structure, not a bare heading).
const pool = require("../src/config/database");
const { createEvalQuestion } = require("../src/services/evalQuestionService");

function stripHeading(text) {
    const colonIndex = text.indexOf(":");
    return colonIndex === -1 ? text : text.slice(colonIndex + 1).trim();
}

(async () => {
    const { rows: sourceRows } = await pool.query(`SELECT id FROM sources WHERE code = 'ZATCA_VAT_AGREEMENT' LIMIT 1`);
    const sourceId = sourceRows[0].id;

    const deleted = await pool.query(
        `DELETE FROM eval_questions WHERE version = 'v1' AND domain = 'zatca'
         AND expected_citations->>0 IN (
             SELECT a.id::text FROM articles a
             JOIN documents d ON d.id = a.document_id
             WHERE d.source_id = $1
         )
         RETURNING id`,
        [sourceId]
    );
    console.log(`Deleted ${deleted.rowCount} old VAT_AGREEMENT question(s).`);

    const { rows: articles } = await pool.query(
        `SELECT a.id, a.article_number, a.text_ar
         FROM articles a
         JOIN documents d ON d.id = a.document_id
         WHERE d.source_id = $1 AND d.superseded_by IS NULL
         ORDER BY a.ordering
         LIMIT 30;`,
        [sourceId]
    );

    let picked = null, words = "";
    for (const article of articles) {
        const raw = article.text_ar || "";
        if (!raw.includes(":")) continue; // skip headings/preambles with no real structure
        const content = stripHeading(raw);
        const candidateWords = content.split(/\s+/).filter(Boolean).slice(0, 15).join(" ");
        if (candidateWords.length > 30) {
            picked = article;
            words = candidateWords;
            break;
        }
    }

    if (!picked) {
        console.log("No suitable structured article found for VAT_AGREEMENT.");
        await pool.end();
        return;
    }

    await createEvalQuestion({
        version: "v1",
        domain: "zatca",
        questionAr: words,
        expectedCitations: [picked.id],
        attorneyRubric: "auto-generated content-based smoke-test (re-seeded 2026-08-03, picked a specific article instead of the generic chapter-title preamble) — needs attorney review before being trusted for the cutover gate (spec section 7)"
    });
    console.log(`Seeded VAT_AGREEMENT question from article ${picked.article_number}: "${words.slice(0, 60)}..."`);

    await pool.end();
})();
