// Diagnostic for all 4 zatca sources: shows document versions (does the
// LATEST one actually have articles?) and checks whether each zatca
// eval_question's expected_citations point at an article that belongs to
// that source's current latest document.
const pool = require("./src/config/database");

const ZATCA_CODES = [
    "ZATCA_EINVOICING", "ZATCA_EINVOICING_REGULATION", // handles either, in case of the slug mismatch
    "ZATCA_IMPLEMENTATION_RESOLUTION",
    "ZATCA_GUIDELINES",
    "ZATCA_VAT_AGREEMENT"
];

(async () => {
    const { rows: sources } = await pool.query(
        `SELECT id, code, slug FROM sources WHERE code = ANY($1)`,
        [ZATCA_CODES]
    );
    console.log(`Found ${sources.length} zatca source row(s) in DB:`);
    for (const s of sources) console.log(`  code=${s.code} slug=${s.slug} id=${s.id}`);
    console.log();

    const latestDocBySource = {};
    for (const source of sources) {
        const { rows: docs } = await pool.query(
            `SELECT id, version, created_at FROM documents WHERE source_id = $1 AND superseded_by IS NULL LIMIT 1`,
            [source.id]
        );
        const latest = docs[0] || null;
        latestDocBySource[source.id] = latest;
        console.log(`--- ${source.code} ---`);
        if (!latest) {
            console.log("  NO latest document found at all.");
            continue;
        }
        const { rows: artCount } = await pool.query(
            `SELECT COUNT(*)::int AS c FROM articles WHERE document_id = $1`,
            [latest.id]
        );
        console.log(`  latest document ${latest.id} (v${latest.version}) has ${artCount[0].c} articles.`);
    }
    console.log();

    console.log("=== eval_questions (v1, domain=zatca) ===");
    const { rows: questions } = await pool.query(
        `SELECT id, question_ar, expected_citations FROM eval_questions WHERE version = 'v1' AND domain = 'zatca'`
    );
    for (const q of questions) {
        console.log(`--- question ${q.id} ---`);
        console.log("  question_ar:", JSON.stringify((q.question_ar || "").slice(0, 80)));
        for (const artId of q.expected_citations) {
            const { rows: artRows } = await pool.query(
                `SELECT a.document_id, d.source_id, s.code
                 FROM articles a
                 JOIN documents d ON d.id = a.document_id
                 JOIN sources s ON s.id = d.source_id
                 WHERE a.id = $1`,
                [artId]
            );
            if (artRows.length === 0) {
                console.log(`    citation ${artId}: DOES NOT EXIST`);
                continue;
            }
            const row = artRows[0];
            const latest = latestDocBySource[row.source_id];
            const isLatest = latest && latest.id === row.document_id;
            console.log(`    citation ${artId}: source=${row.code}, belongs to LATEST doc: ${isLatest}`);
        }
    }

    await pool.end();
})();