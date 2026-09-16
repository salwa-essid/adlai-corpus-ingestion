// Diagnostic dump for the eval_questions table -- written to help resolve
// the release requirement to ship `eval_questions.jsonl`, citing
// {source_file, article_number} / {source_file, section_ref} instead of
// this table's internal `expected_citations` values (which today are a mix
// of this repo's own `articles.id` UUIDs and, for a few older rows, raw
// legacy numbers like the NCA questions' "[10]" that predate the
// section_ref-based NCA rebuild).
//
// This can only run where the Postgres it talks to is reachable (i.e. on
// the local docker-compose Postgres) -- nothing remote can query it. Run
// it, then send the resulting eval_questions_dump.json back so the
// citations can be re-anchored and the
// release file built against the CURRENT output/*.json content.
//
// Usage: node scripts/dump-eval-questions.js [version]
//   (version defaults to dumping ALL versions if omitted)

const fs = require("fs");
const path = require("path");
const pool = require("../src/config/database");

async function main() {
    const version = process.argv[2];

    const query = version
        ? `SELECT id, version, domain, question_ar, question_en, expected_citations,
                  accepted_answer_ranges, attorney_rubric, graded_by, created_at
           FROM eval_questions WHERE version = $1 ORDER BY domain, created_at;`
        : `SELECT id, version, domain, question_ar, question_en, expected_citations,
                  accepted_answer_ranges, attorney_rubric, graded_by, created_at
           FROM eval_questions ORDER BY domain, created_at;`;

    const { rows } = await pool.query(query, version ? [version] : []);

    // For every citation that looks like an internal articles.id (a UUID),
    // resolve it to {source_slug, article_number, section_ref, text_ar_snippet}
    // so re-anchoring can be done from this dump alone, without a second
    // round trip to the DB.
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    async function resolveCitation(raw) {
        if (typeof raw === "string" && uuidRe.test(raw)) {
            const { rows: r } = await pool.query(
                `SELECT a.article_number, s.slug AS source_slug, LEFT(a.text_ar, 80) AS snippet
                 FROM articles a
                 JOIN documents d ON d.id = a.document_id
                 JOIN sources s ON s.id = d.source_id
                 WHERE a.id = $1`,
                [raw]
            );
            if (r.length === 0) return { raw, resolved: null, note: "articles.id not found (deleted/superseded?)" };
            return { raw, resolved: r[0] };
        }
        return { raw, resolved: null, note: "not a UUID -- likely a stale/legacy numeric ref, needs manual re-anchor" };
    }

    const out = [];
    for (const row of rows) {
        const citations = Array.isArray(row.expected_citations) ? row.expected_citations : [];
        const resolvedCitations = [];
        for (const c of citations) {
            resolvedCitations.push(await resolveCitation(c));
        }
        out.push({
            id: row.id,
            version: row.version,
            domain: row.domain,
            question_ar: row.question_ar,
            question_en: row.question_en,
            expected_citations_raw: row.expected_citations,
            expected_citations_resolved: resolvedCitations,
            accepted_answer_ranges: row.accepted_answer_ranges,
            attorney_rubric: row.attorney_rubric,
            created_at: row.created_at,
        });
    }

    const outPath = path.join(__dirname, "..", "eval_questions_dump.json");
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
    console.log(`Wrote ${out.length} eval_questions row(s) to ${outPath}`);
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
