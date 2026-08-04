// Same pattern as fix-companies.js / fix-zatca.js: the ACTIVE
// zatca_einvoicing_regulation source's latest document has 0 articles
// (its real 7-article data ended up under a separate, dead legacy
// source row from before this source was renamed — see the comment in
// src/repositories/sourceRepository.js). Populate the ACTIVE document so
// future scrapes/ingests of this source actually have something to
// find, instead of relying on the orphaned legacy row forever.
const fs = require("fs");
const pool = require("../src/config/database");
const { saveArticles } = require("../src/repositories/articleRepository");

(async () => {
    const { rows: sourceRows } = await pool.query(`SELECT id FROM sources WHERE code = 'ZATCA_EINVOICING_REGULATION' LIMIT 1`);
    const sourceId = sourceRows[0].id;

    const { rows: docs } = await pool.query(
        `SELECT id FROM documents WHERE source_id = $1 AND superseded_by IS NULL LIMIT 1`,
        [sourceId]
    );
    const documentId = docs[0].id;

    const articles = JSON.parse(fs.readFileSync("./output/zatca_einvoicing_regulation.json", "utf-8"));
    console.log(`Saving ${articles.length} articles into document ${documentId}...`);
    await saveArticles(documentId, articles);
    console.log("Done.");

    const { rows: check } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM articles WHERE document_id = $1`,
        [documentId]
    );
    console.log(`Articles now in this document: ${check[0].c}`);

    await pool.end();
})();
