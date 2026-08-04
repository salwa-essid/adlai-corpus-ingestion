// Diagnostic: compares the CURRENT output/labor.json file (what would be
// used if we ran ingest right now) against EVERY document version stored
// in the DB for labor, so we can see exactly where the fixed text is (or
// isn't) living, instead of guessing.
const fs = require("fs");
const crypto = require("crypto");
const pool = require("../src/config/database");

function hash(data) {
    return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

(async () => {
    // ---- current file on disk ----
    const raw = fs.readFileSync("../output/labor.json", "utf-8");
    const articles = JSON.parse(raw);
    const fileHash = hash(articles);
    console.log("=== output/labor.json (current file on disk) ===");
    console.log("article count:", articles.length);
    console.log("content hash:", fileHash);
    console.log("first article text (first 150 chars):");
    console.log(JSON.stringify((articles[0] && articles[0].text || "").slice(0, 150)));
    console.log();

    // ---- DB: source + all document versions ----
    const { rows: sourceRows } = await pool.query(`SELECT id FROM sources WHERE code = 'LABOR_LAW' LIMIT 1`);
    if (sourceRows.length === 0) {
        console.log("No LABOR_LAW source row in DB.");
        await pool.end();
        return;
    }
    const sourceId = sourceRows[0].id;

    const { rows: docs } = await pool.query(
        `SELECT id, version, source_hash, superseded_by, created_at
         FROM documents WHERE source_id = $1 ORDER BY created_at ASC`,
        [sourceId]
    );
    console.log(`=== DB: ${docs.length} document version(s) for labor ===`);
    for (const doc of docs) {
        console.log(`--- document ${doc.id} (version ${doc.version}, created ${doc.created_at}) ---`);
        console.log("  source_hash:", doc.source_hash);
        console.log("  superseded_by:", doc.superseded_by || "(none — this is a LATEST candidate)");
        console.log("  matches current file hash:", doc.source_hash === fileHash ? "YES" : "no");

        const { rows: arts } = await pool.query(
            `SELECT article_number, text_ar FROM articles WHERE document_id = $1 ORDER BY ordering LIMIT 1`,
            [doc.id]
        );
        if (arts.length > 0) {
            console.log(`  first article (article_number ${arts[0].article_number}) text_ar (first 150 chars):`);
            console.log("  " + JSON.stringify((arts[0].text_ar || "").slice(0, 150)));
        } else {
            console.log("  (no articles found for this document)");
        }
        console.log();
    }

    await pool.end();
})();
