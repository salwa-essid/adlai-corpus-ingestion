// One-off check: misa, sama_banking_control_law and sama_central_bank_law
// have fetched_at: null in output/*.json and manifest.json (never had a
// real fetch timestamp recorded on the source side). Alex asked for this
// to be "derivable from your ingestion metadata rather than invented" --
// and it actually is: ingestionService.js's saveSnapshot() call always
// writes a real Date into source_snapshots.fetched_at, falling back to
// `new Date()` (the actual moment that ingest ran) whenever source.fetched_at
// was null. So the DB already has a true, non-fabricated timestamp for
// when each of these was actually last ingested -- this just reads it out.
//
// Run from the repo root: node scripts/check-real-fetched-at.js
// (uses the same DB env vars/.env as the rest of the app -- run it the
// same way you'd run `npm start`)

const pool = require("../src/config/database");

async function main() {
    const { rows } = await pool.query(`
        SELECT s.slug,
               MIN(ss.fetched_at) AS first_fetched_at,
               MAX(ss.fetched_at) AS last_fetched_at,
               COUNT(*)::int AS snapshot_count
        FROM source_snapshots ss
        JOIN sources s ON s.id = ss.source_id
        WHERE s.slug IN ('misa', 'sama_banking_control_law', 'sama_central_bank_law')
        GROUP BY s.slug
        ORDER BY s.slug;
    `);

    if (rows.length === 0) {
        console.log("No source_snapshots rows found for these 3 sources -- have they ever been ingested (npm run ingest)?");
    } else {
        console.log(JSON.stringify(rows, null, 2));
    }
    await pool.end();
}

main().catch((err) => {
    console.error("Query failed:", err.message);
    process.exit(1);
});
