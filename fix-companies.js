// Attempts to re-save companies' articles directly into the existing
// LATEST document row (which already has the correct source_hash but
// zero articles — meaning the insert transaction rolled back last time,
// most likely because the Cohere embeddings call failed partway through).
// This will print the FULL error if it fails again, so we can see the
// real cause instead of guessing.
const fs = require("fs");
const pool = require("./src/config/database");
const { saveArticles } = require("./src/repositories/articleRepository");

(async () => {
    const { rows: sourceRows } = await pool.query(`SELECT id FROM sources WHERE code = 'COMPANIES_LAW' LIMIT 1`);
    if (sourceRows.length === 0) {
        console.log("No COMPANIES_LAW source found.");
        await pool.end();
        return;
    }
    const sourceId = sourceRows[0].id;

    const { rows: docs } = await pool.query(
        `SELECT id, source_hash FROM documents WHERE source_id = $1 AND superseded_by IS NULL LIMIT 1`,
        [sourceId]
    );
    if (docs.length === 0) {
        console.log("No latest document found for companies.");
        await pool.end();
        return;
    }
    const documentId = docs[0].id;
    console.log("Latest companies document id:", documentId);

    const articles = JSON.parse(fs.readFileSync("./output/companies.json", "utf-8"));
    console.log(`Attempting to save ${articles.length} articles into this document...`);

    try {
        await saveArticles(documentId, articles);
        console.log("SUCCESS — articles saved.");
    } catch (error) {
        console.log("FAILED — full error below:");
        console.log("message:", error.message);
        console.log("name:", error.name);
        if (error.status) console.log("status:", error.status);
        if (error.response) {
            try {
                console.log("response body:", JSON.stringify(error.response.body || error.response.data));
            } catch (e) { /* ignore */ }
        }
        console.log("stack:", error.stack);
    }

    await pool.end();
})();