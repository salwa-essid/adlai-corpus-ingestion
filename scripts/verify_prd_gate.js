
require('dotenv').config();
const { Client } = require('pg');
const MANDATORY_DOMAINS = [
    { law_type: 'ZATCA', slugs: ['zatca_einvoicing_regulation', 'zatca_implementation_resolution', 'zatca_guidelines', 'zatca_vat_agreement'] },
    { law_type: 'PDPL', slugs: ['pdpl'] },
    { law_type: 'SAMA', slugs: ['sama', 'sama_banking_control_law', 'sama_central_bank_law'] },
    { law_type: 'CMA', slugs: ['cma'] },
    { law_type: 'NCA', slugs: ['nca'] },
    { law_type: 'MISA', slugs: ['misa'] },
];
const LEGACY_DOMAINS = [
    { law_type: 'COMPANIES', slugs: ['companies'] },
    { law_type: 'LABOR', slugs: ['labor'] },
];
function buildClient() {
    const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PG_CONNECTION_STRING;
    if (cs) return new Client({ connectionString: cs });
    return new Client({
        host: process.env.PGHOST || process.env.DB_HOST,
        port: process.env.PGPORT || process.env.DB_PORT || 5432,
        user: process.env.PGUSER || process.env.DB_USER,
        password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
        database: process.env.PGDATABASE || process.env.DB_NAME,
    });
}

async function domainCounts(client, slugs) {
    // IMPORTANT: filter to the ACTIVE document version only (superseded_by IS
    // NULL). Every re-ingest creates a new documents row and properly marks
    // the old one as superseded — confirmed via diagnose_versions.js — so
    // counting across all versions (as v1 of this script did) massively
    // over-counts by including stale/superseded article rows.
    const r = await client.query(
        `SELECT s.slug,
            COUNT(DISTINCT d.id) AS doc_count,
            COUNT(a.id) AS article_count
     FROM sources s
     LEFT JOIN documents d ON d.source_id = s.id AND d.superseded_by IS NULL
     LEFT JOIN articles a ON a.document_id = d.id
     WHERE s.slug = ANY($1::text[])
     GROUP BY s.slug`,
        [slugs]
    );
    return r.rows;
}
async function main() {
    const client = buildClient();
    await client.connect();
    console.log('✅ Connected to database\n');

    // --- 1. per-domain counts (Section 8.1's "COUNT(*) GROUP BY law_type") ---
    console.log('--- Section 8.1: article counts per mandatory domain ---');
    const missing = [];
    for (const d of MANDATORY_DOMAINS) {
        const rows = await domainCounts(client, d.slugs);
        const total = rows.reduce((sum, r) => sum + Number(r.article_count), 0);
        const foundSlugs = rows.map(r => r.slug);
        const missingSlugs = d.slugs.filter(s => !foundSlugs.includes(s));
        console.log(
            d.law_type, '-> TOTAL:', total,
            '|', rows.map(r => `${r.slug}:${r.article_count}`).join(', ') || '(no rows at all)',
            missingSlugs.length ? `| MISSING FROM DB: ${missingSlugs.join(', ')}` : ''
        );
        if (total === 0) missing.push(d.law_type);
    }
    console.log('');
    console.log('--- Legacy (must not regress) ---');
    for (const d of LEGACY_DOMAINS) {
        const rows = await domainCounts(client, d.slugs);
        const total = rows.reduce((sum, r) => sum + Number(r.article_count), 0);
        console.log(d.law_type, '-> TOTAL:', total);
    }
    console.log('');

    // --- 2. embeddings populated (active documents only) ----------------------
    const embRes = await client.query(
        `SELECT COUNT(*) AS total,
            COUNT(ac.embedding_ar) AS with_ar,
            COUNT(ac.embedding_en) AS with_en
     FROM article_chunks ac
     JOIN articles a ON a.id = ac.article_id
     JOIN documents d ON d.id = a.document_id AND d.superseded_by IS NULL`
    );
    const embAllRes = await client.query(`SELECT COUNT(*) AS total FROM article_chunks`);
    console.log('--- Embeddings (article_chunks, ACTIVE documents only) ---');
    console.log('active chunks:', embRes.rows[0].total,
        '| with embedding_ar:', embRes.rows[0].with_ar,
        '| with embedding_en:', embRes.rows[0].with_en,
        '| (total incl. stale superseded chunks in table:', embAllRes.rows[0].total, ')');
    const emptyEmbeddings = Number(embRes.rows[0].total) > 0 && Number(embRes.rows[0].with_ar) === 0;
    console.log('');

    // --- 3. source_snapshots (SHA-256 archive requirement) --------------------
    const snapRes = await client.query(`SELECT COUNT(*) AS total FROM source_snapshots`);
    console.log('--- source_snapshots (SHA-256 archive) ---');
    console.log('rows:', snapRes.rows[0].total);
    if (Number(snapRes.rows[0].total) === 0) {
        console.log('⚠️  Table exists but is EMPTY — sources are not being archived on ingest, per Section 3.4 requirement.');
    }
    console.log('');

    // --- 4. cross_references ----------------------------------------------------
    const crossRes = await client.query(`SELECT COUNT(*) AS total FROM cross_references`);
    console.log('--- cross_references ---');
    console.log('rows:', crossRes.rows[0].total);
    if (Number(crossRes.rows[0].total) === 0) {
        console.log('⚠️  Table exists but is EMPTY — cross-reference extraction (Section 3.4) has not run yet.');
    }
    console.log('');

    // --- 5. ingestion_runs (idempotency + logging) -----------------------------
    const runsRes = await client.query(
        `SELECT s.slug, COUNT(ir.id) AS run_count,
            MAX(ir.completed_at) AS last_run,
            SUM(CASE WHEN ir.articles_created = 0 THEN 1 ELSE 0 END) AS zero_change_runs
     FROM ingestion_runs ir
     JOIN sources s ON s.id = ir.source_id
     GROUP BY s.slug
     ORDER BY run_count DESC`
    );
    console.log('--- ingestion_runs (per source) ---');
    runsRes.rows.forEach(row =>
        console.log(row.slug, '->', row.run_count, 'runs |', row.zero_change_runs, 'were no-op (idempotency evidence) | last:', row.last_run)
    );
    console.log('');

    // --- Summary ----------------------------------------------------------------
    console.log('=== SUMMARY vs Section 3.4 / 8.1 (corpus items) ===');
    console.log(missing.length === 0
        ? '✅ All 6 mandatory domains have non-zero article counts in the database.'
        : `❌ Zero articles in DB for: ${missing.join(', ')}`);
    console.log(emptyEmbeddings ? '❌ article_chunks exist but embedding_ar is NOT populated for any of them — retrieval will not work.' : '');
    console.log(Number(snapRes.rows[0].total) === 0 ? '❌ source_snapshots is empty — SHA-256 archival requirement not met.' : '✅ source_snapshots has data.');
    console.log(Number(crossRes.rows[0].total) === 0 ? '❌ cross_references is empty — cross-reference extraction requirement not met.' : '✅ cross_references has data.');
    console.log('⚠️  Still needs to be tested LIVE (not inferable from this script):');
    console.log('   - sample query <3s per domain via the production API');
    console.log('   - idempotent rerun = 0 new rows (rerun `npm run ingest -- --source <x>` on an unchanged file and confirm)');

    await client.end();
}

main().catch(err => {
    console.error('❌ ERROR:', err.message);
    process.exit(1);
});