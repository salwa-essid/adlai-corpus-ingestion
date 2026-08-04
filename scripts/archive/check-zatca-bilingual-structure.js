// Checks whether ZATCA_GUIDELINES / ZATCA_IMPLEMENTATION_RESOLUTION's
// "empty text_ar" articles are a real bug, or just the English half of
// a deliberately-paired ar_X / en_X bilingual structure (in which case
// each en_X should have a matching ar_X with real Arabic content, and
// there's nothing to fix).
const pool = require("../src/config/database");

const CODES = ["ZATCA_GUIDELINES", "ZATCA_IMPLEMENTATION_RESOLUTION"];

(async () => {
    for (const code of CODES) {
        console.log(`\n=== ${code} ===`);
        const { rows: sourceRows } = await pool.query(`SELECT id FROM sources WHERE code = $1 LIMIT 1`, [code]);
        const sourceId = sourceRows[0].id;

        const { rows: docs } = await pool.query(
            `SELECT id FROM documents WHERE source_id = $1 AND superseded_by IS NULL LIMIT 1`,
            [sourceId]
        );
        const documentId = docs[0].id;

        const { rows: articles } = await pool.query(
            `SELECT article_number, text_ar, text_en FROM articles WHERE document_id = $1 ORDER BY ordering`,
            [documentId]
        );

        const arNumbers = new Set(articles.filter(a => a.article_number?.startsWith("ar_")).map(a => a.article_number.replace("ar_", "")));
        const enNumbers = new Set(articles.filter(a => a.article_number?.startsWith("en_")).map(a => a.article_number.replace("en_", "")));
        const otherNumbers = articles.filter(a => !a.article_number?.startsWith("ar_") && !a.article_number?.startsWith("en_"));

        console.log(`  total articles: ${articles.length}`);
        console.log(`  ar_ prefixed: ${arNumbers.size}, en_ prefixed: ${enNumbers.size}, other: ${otherNumbers.length}`);

        const enWithoutAr = [...enNumbers].filter(n => !arNumbers.has(n));
        const arWithoutEn = [...arNumbers].filter(n => !enNumbers.has(n));
        console.log(`  en_ articles with NO matching ar_ counterpart: ${enWithoutAr.length} ${enWithoutAr.slice(0, 5)}`);
        console.log(`  ar_ articles with NO matching en_ counterpart: ${arWithoutEn.length} ${arWithoutEn.slice(0, 5)}`);

        // Spot-check: does the ar_ counterpart of an en_ article that
        // showed up as "empty text_ar" actually have real text_ar?
        if (enNumbers.size > 0) {
            const sampleNum = [...enNumbers][0];
            const { rows: pair } = await pool.query(
                `SELECT article_number, text_ar, text_en FROM articles WHERE document_id = $1 AND (article_number = $2 OR article_number = $3)`,
                [documentId, `ar_${sampleNum}`, `en_${sampleNum}`]
            );
            console.log(`  spot check pair for "${sampleNum}":`);
            for (const p of pair) {
                console.log(`    ${p.article_number}: text_ar len=${(p.text_ar || "").length}, text_en len=${(p.text_en || "").length}`);
            }
        }
    }
    await pool.end();
})();
