const pool = require("./src/config/database");
const { createEvalQuestion } = require("./src/services/evalQuestionService");

const DOMAIN_MAP = {
    COMPANIES_LAW: "companies",
    LABOR_LAW: "labor",
    PDPL: "pdpl",
    SAMA_CIRCULAR: "sama",
    CMA_LAW: "cma",
    NCA_ECC: "nca",
    MISA_INVESTMENT_LAW: "misa",
    ZATCA_EINVOICING: "zatca",
    ZATCA_IMPLEMENTATION_RESOLUTION: "zatca",
    ZATCA_GUIDELINES: "zatca",
    ZATCA_VAT_AGREEMENT: "zatca"
};

// Turns "المادة الأولى: التعريفات. يقصد بكذا..." into "يقصد بكذا..." —
// drop the heading (before the first colon), keep the actual content.
function stripHeading(text) {
    const colonIndex = text.indexOf(":");
    return colonIndex === -1 ? text : text.slice(colonIndex + 1).trim();
}

(async () => {
    const del = await pool.query(
        `DELETE FROM eval_questions WHERE attorney_rubric LIKE 'auto-generated smoke-test question%'`
    );
    console.log(`Removed ${del.rowCount} low-quality smoke-test questions.`);

    const { rows: sources } = await pool.query(`SELECT id, code FROM sources ORDER BY code`);

    let seeded = 0;
    for (const source of sources) {
        const domain = DOMAIN_MAP[source.code];
        if (!domain) continue;

        const { rows: articles } = await pool.query(
            `SELECT a.id, a.article_number, a.text_ar
             FROM articles a
             JOIN documents d ON d.id = a.document_id
             WHERE d.source_id = $1
             ORDER BY a.ordering
             LIMIT 1;`,
            [source.id]
        );
        if (articles.length === 0) continue;

        const article = articles[0];
        const content = stripHeading(article.text_ar || "");
        const words = content.split(/\s+/).filter(Boolean).slice(0, 15).join(" ");
        if (!words) {
            console.log(`Skipping ${source.code} — no usable content after heading.`);
            continue;
        }

        await createEvalQuestion({
            version: "v1",
            domain,
            questionAr: words,
            expectedCitations: [article.id],
            attorneyRubric: "auto-generated content-based smoke-test — needs attorney review before being trusted for the cutover gate (spec section 7)"
        });
        console.log(`Seeded [${domain}] ${source.code}: "${words.slice(0, 50)}..."`);
        seeded++;
    }

    console.log(`\nSeeded ${seeded} eval_questions.`);
    await pool.end();
})();