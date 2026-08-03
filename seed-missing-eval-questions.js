// Adds eval_questions (v1) for the domains that had ZERO coverage in the
// last eval run — labor, cma, nca, misa, pdpl. (sama is skipped: its
// data was wiped and there's no source for it yet. companies/zatca
// already have questions from before, so they're skipped too — this
// script checks for existing v1 questions per domain first, so it's
// safe to re-run.)
const pool = require("./src/config/database");
const { createEvalQuestion } = require("./src/services/evalQuestionService");

const TARGET_DOMAINS = {
    LABOR_LAW: "labor",
    CMA_LAW: "cma",
    NCA_ECC: "nca",
    MISA_INVESTMENT_LAW: "misa",
    PDPL: "pdpl"
};

// Turns "المادة الأولى: التعريفات. يقصد بكذا..." into "يقصد بكذا..." —
// drop the heading (before the first colon), keep the actual content.
function stripHeading(text) {
    const colonIndex = text.indexOf(":");
    return colonIndex === -1 ? text : text.slice(colonIndex + 1).trim();
}

(async () => {
    const { rows: sources } = await pool.query(`SELECT id, code FROM sources ORDER BY code`);

    let seeded = 0;
    for (const source of sources) {
        const domain = TARGET_DOMAINS[source.code];
        if (!domain) continue;

        const { rows: existing } = await pool.query(
            `SELECT id FROM eval_questions WHERE version = 'v1' AND domain = $1 LIMIT 1`,
            [domain]
        );
        if (existing.length > 0) {
            console.log(`Skipping ${source.code} — domain "${domain}" already has a v1 question.`);
            continue;
        }

        // Grab a few candidate articles and pick the first one with
        // enough real content (article 1 is sometimes just a title/page
        // header with little text, per what we saw in misa/sama dumps).
        const { rows: articles } = await pool.query(
            `SELECT a.id, a.article_number, a.text_ar
             FROM articles a
             JOIN documents d ON d.id = a.document_id
             WHERE d.source_id = $1
             ORDER BY a.ordering
             LIMIT 5;`,
            [source.id]
        );

        let picked = null;
        let words = "";
        for (const article of articles) {
            const content = stripHeading(article.text_ar || "");
            const candidateWords = content.split(/\s+/).filter(Boolean).slice(0, 15).join(" ");
            if (candidateWords.length > 20) {
                picked = article;
                words = candidateWords;
                break;
            }
        }

        if (!picked) {
            console.log(`Skipping ${source.code} — no article with usable Arabic content found.`);
            continue;
        }

        await createEvalQuestion({
            version: "v1",
            domain,
            questionAr: words,
            expectedCitations: [picked.id],
            attorneyRubric: "auto-generated content-based smoke-test — needs attorney review before being trusted for the cutover gate (spec section 7)"
        });
        console.log(`Seeded [${domain}] ${source.code} (article ${picked.article_number}): "${words.slice(0, 60)}..."`);
        seeded++;
    }

    console.log(`\nSeeded ${seeded} new eval_questions.`);
    await pool.end();
})();