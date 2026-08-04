// Adds up to 2 MORE eval_questions per real source (on top of whatever
// already exists), picked from different points in the document so we
// aren't just re-testing article 1 every time. This matters because
// right now most domains have exactly ONE question — a single lucky or
// unlucky match swings that whole domain's recall between 0.0 and 1.0,
// which makes "recall@3 = 1.0" look more solid than it currently is.
// sama is skipped (no working source yet).
const pool = require("../src/config/database");
const { createEvalQuestion } = require("../src/services/evalQuestionService");

function stripHeading(text) {
    const colonIndex = text.indexOf(":");
    return colonIndex === -1 ? text : text.slice(colonIndex + 1).trim();
}

const SOURCES = [
    { code: "LABOR_LAW", domain: "labor" },
    { code: "COMPANIES_LAW", domain: "companies" },
    { code: "CMA_LAW", domain: "cma" },
    { code: "NCA_ECC", domain: "nca" },
    { code: "MISA_INVESTMENT_LAW", domain: "misa" },
    { code: "PDPL", domain: "pdpl" },
    { code: "ZATCA_EINVOICING_REGULATION", domain: "zatca" },
    { code: "ZATCA_IMPLEMENTATION_RESOLUTION", domain: "zatca" },
    { code: "ZATCA_GUIDELINES", domain: "zatca" },
    { code: "ZATCA_VAT_AGREEMENT", domain: "zatca" }
];

const ADDITIONAL_PER_SOURCE = 2;

(async () => {
    // Existing citations, so we never pick an article that's already an
    // expected_citations target for some other question (avoids exact
    // duplicate questions).
    const { rows: existingQs } = await pool.query(`SELECT expected_citations FROM eval_questions WHERE version = 'v1'`);
    const alreadyCited = new Set(existingQs.flatMap(q => q.expected_citations));

    let totalSeeded = 0;

    for (const src of SOURCES) {
        const { rows: sourceRows } = await pool.query(`SELECT id FROM sources WHERE code = $1 LIMIT 1`, [src.code]);
        if (sourceRows.length === 0) {
            console.log(`--- ${src.code}: source not found, skipping ---`);
            continue;
        }
        const sourceId = sourceRows[0].id;

        const { rows: docs } = await pool.query(
            `SELECT id FROM documents WHERE source_id = $1 AND superseded_by IS NULL LIMIT 1`,
            [sourceId]
        );
        if (docs.length === 0) {
            console.log(`--- ${src.code}: no latest document, skipping ---`);
            continue;
        }
        const documentId = docs[0].id;

        const { rows: articles } = await pool.query(
            `SELECT id, article_number, text_ar FROM articles WHERE document_id = $1 ORDER BY ordering`,
            [documentId]
        );

        // Spread picks across the document instead of clustering near
        // the start (definitions/preambles tend to be generic and
        // collide across sources — we saw this bite us with VAT's
        // "Chapter One: Definitions" heading matching companies law).
        const candidates = articles.filter(a => {
            if (alreadyCited.has(a.id)) return false;
            const raw = a.text_ar || "";
            if (!raw.includes(":")) return false; // needs real structure, not a bare heading
            const content = stripHeading(raw);
            const words = content.split(/\s+/).filter(Boolean);
            return words.length >= 15;
        });

        if (candidates.length === 0) {
            console.log(`--- ${src.code}: no additional usable candidates, skipping ---`);
            continue;
        }

        // Take evenly-spaced picks across the candidate list.
        const picks = [];
        const step = Math.max(1, Math.floor(candidates.length / (ADDITIONAL_PER_SOURCE + 1)));
        for (let i = 1; i <= ADDITIONAL_PER_SOURCE && picks.length < ADDITIONAL_PER_SOURCE; i++) {
            const idx = Math.min(i * step, candidates.length - 1);
            if (!picks.includes(candidates[idx])) picks.push(candidates[idx]);
        }

        console.log(`--- ${src.code}: seeding ${picks.length} question(s) ---`);
        for (const article of picks) {
            const content = stripHeading(article.text_ar);
            const words = content.split(/\s+/).filter(Boolean).slice(0, 15).join(" ");
            await createEvalQuestion({
                version: "v1",
                domain: src.domain,
                questionAr: words,
                expectedCitations: [article.id],
                attorneyRubric: "auto-generated content-based smoke-test (batch 2, 2026-08-04, expanding coverage beyond 1 question/domain) — needs attorney review before being trusted for the cutover gate (spec section 7)"
            });
            alreadyCited.add(article.id);
            console.log(`  seeded article ${article.article_number}: "${words.slice(0, 60)}..."`);
            totalSeeded++;
        }
    }

    console.log(`\nTotal new questions seeded: ${totalSeeded}`);
    await pool.end();
})();
