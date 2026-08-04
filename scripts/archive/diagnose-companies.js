// Diagnostic for the "companies" domain, same idea as diagnose-labor.js:
// - show all document versions in the DB for companies
// - show the existing eval_questions for domain 'companies'
// - check whether each question's expected_citations article id actually
//   belongs to the LATEST (non-superseded) document — if it points at an
//   old/superseded document's article, that's why recall is 0.
const fs = require("fs");
const crypto = require("crypto");
const pool = require("../src/config/database");

function hash(data) {
    return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

(async () => {
    const raw = fs.readFileSync("./output/companies.json", "utf-8");
    const articles = JSON.parse(raw);
    const fileHash = hash(articles);
    console.log("=== output/companies.json (current file on disk) ===");
    console.log("article count:", articles.length, "| content hash:", fileHash);
    console.log();

    const { rows: sourceRows } = await pool.query(`SELECT id FROM sources WHERE code = 'COMPANIES_LAW' LIMIT 1`);
    if (sourceRows.length === 0) {
        console.log("No COMPANIES_LAW source row in DB.");
        await pool.end();
        return;
    }
    const sourceId = sourceRows[0].id;

    const { rows: docs } = await pool.query(
        `SELECT id, version, source_hash, superseded_by, created_at
         FROM documents WHERE source_id = $1 ORDER BY created_at ASC`,
        [sourceId]
    );
    console.log(`=== DB: ${docs.length} document version(s) for companies ===`);
    let latestDocId = null;
    for (const doc of docs) {
        const isLatest = !doc.superseded_by;
        if (isLatest) latestDocId = doc.id;
        console.log(`--- document ${doc.id} (version ${doc.version}, created ${doc.created_at}) ---`);
        console.log("  matches current file hash:", doc.source_hash === fileHash ? "YES" : "no");
        console.log("  is latest (superseded_by IS NULL):", isLatest);
        const { rows: arts } = await pool.query(
            `SELECT article_number, text_ar FROM articles WHERE document_id = $1 ORDER BY ordering LIMIT 1`,
            [doc.id]
        );
        if (arts.length > 0) {
            console.log(`  first article text_ar (first 120 chars): ${JSON.stringify((arts[0].text_ar || "").slice(0, 120))}`);
        } else {
            console.log("  (no articles for this document)");
        }
        console.log();
    }

    console.log("=== eval_questions (v1, domain=companies) ===");
    const { rows: questions } = await pool.query(
        `SELECT id, question_ar, expected_citations FROM eval_questions WHERE version = 'v1' AND domain = 'companies'`
    );
    for (const q of questions) {
        console.log(`--- question ${q.id} ---`);
        console.log("  question_ar:", JSON.stringify((q.question_ar || "").slice(0, 100)));
        console.log("  expected_citations:", q.expected_citations);
        for (const artId of q.expected_citations) {
            const { rows: artRows } = await pool.query(
                `SELECT a.id, a.document_id, a.text_ar FROM articles a WHERE a.id = $1`,
                [artId]
            );
            if (artRows.length === 0) {
                console.log(`    citation ${artId}: DOES NOT EXIST in articles table`);
            } else {
                const belongsToLatest = artRows[0].document_id === latestDocId;
                console.log(`    citation ${artId}: exists, document_id=${artRows[0].document_id}, belongs to LATEST doc: ${belongsToLatest}`);
                console.log(`      text_ar (first 100 chars): ${JSON.stringify((artRows[0].text_ar || "").slice(0, 100))}`);
            }
        }
        console.log();
    }

    await pool.end();
})();
