// Final sweep across every real source (sama excluded, no working
// source yet) looking for the two bug patterns we found and fixed today,
// in case either one is still lurking somewhere we haven't looked:
//   1. A "latest" document with 0 articles (the empty-document bug).
//   2. Articles that have real content but text_ar is empty/near-empty
//      (the mistagged-language bug, like misa had).
const pool = require("../src/config/database");

(async () => {
    const { rows: sources } = await pool.query(
        `SELECT id, code FROM sources WHERE code != 'SAMA_CIRCULAR' ORDER BY code`
    );

    let problems = 0;

    for (const source of sources) {
        const { rows: docs } = await pool.query(
            `SELECT id, version FROM documents WHERE source_id = $1 AND superseded_by IS NULL LIMIT 1`,
            [source.id]
        );
        if (docs.length === 0) {
            console.log(`[PROBLEM] ${source.code}: no latest document at all.`);
            problems++;
            continue;
        }
        const documentId = docs[0].id;

        const { rows: articles } = await pool.query(
            `SELECT article_number, text_ar, text_en FROM articles WHERE document_id = $1`,
            [documentId]
        );

        if (articles.length === 0) {
            console.log(`[PROBLEM] ${source.code}: latest document (${documentId}) has 0 articles.`);
            problems++;
            continue;
        }

        const emptyArText = articles.filter(a => (a.text_ar || "").trim().length === 0);
        const hasSubstantialEnText = emptyArText.filter(a => (a.text_en || "").length > 50);

        if (hasSubstantialEnText.length > 0) {
            console.log(`[PROBLEM] ${source.code}: ${hasSubstantialEnText.length}/${articles.length} articles have empty text_ar but real text_en content (possible language mistag).`);
            console.log(`   sample article_number: ${hasSubstantialEnText[0].article_number}, text_en sample: ${JSON.stringify(hasSubstantialEnText[0].text_en.slice(0, 80))}`);
            problems++;
            continue;
        }

        console.log(`[OK] ${source.code}: ${articles.length} articles, all with text_ar content.`);
    }

    console.log(`\n${problems === 0 ? "No problems found." : `${problems} source(s) with issues — see [PROBLEM] lines above.`}`);
    await pool.end();
})();
