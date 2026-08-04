// Re-runs saveArticles for misa's LATEST document with the corrected
// Arabic-detection logic (content-based, not just the language tag).
// saveArticles is idempotent per document (deletes + reinserts), so this
// safely overwrites the previous empty-text_ar rows.
const fs = require("fs");
const pool = require("./src/config/database");
const { saveArticles } = require("./src/repositories/articleRepository");

(async () => {
    const { rows: sourceRows } = await pool.query(`SELECT id FROM sources WHERE code = 'MISA_INVESTMENT_LAW' LIMIT 1`);
    const sourceId = sourceRows[0].id;

    const { rows: docs } = await pool.query(
        `SELECT id FROM documents WHERE source_id = $1 AND superseded_by IS NULL LIMIT 1`,
        [sourceId]
    );
    const documentId = docs[0].id;

    const articles = JSON.parse(fs.readFileSync("./output/misa.json", "utf-8"));
    console.log(`Re-saving ${articles.length} misa articles into document ${documentId}...`);
    await saveArticles(documentId, articles);
    console.log("Done.");

    const { rows: check } = await pool.query(
        `SELECT article_number, text_ar FROM articles WHERE document_id = $1 ORDER BY ordering LIMIT 3`,
        [documentId]
    );
    for (const a of check) {
        console.log(`  article ${a.article_number}: text_ar length=${(a.text_ar || "").length}`);
    }

    await pool.end();
})();