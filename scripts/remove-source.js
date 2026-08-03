// One-off cleanup: fully removes a source and everything derived from
// it (documents, articles, chunks, cross-references, ingestion runs,
// snapshots, document diffs). Needed because SAMA got ingested from the
// wrong PDF (English Capital Market Law mislabeled as SAMA) — this
// wipes it cleanly so re-ingesting later with the correct source starts
// fresh, rather than leaving stale/wrong rows behind.
//
// Usage: node scripts/remove-source.js sama
const pool = require("../src/config/database");

async function removeSource(slug) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const { rows } = await client.query("SELECT id, code FROM sources WHERE slug = $1", [slug]);
        if (rows.length === 0) {
            console.log(`No source found with slug "${slug}" — nothing to do.`);
            await client.query("ROLLBACK");
            return;
        }
        const sourceId = rows[0].id;
        console.log(`Removing source "${slug}" (code: ${rows[0].code}, id: ${sourceId})...`);

        const articles = await client.query(
            `DELETE FROM articles WHERE document_id IN (SELECT id FROM documents WHERE source_id = $1) RETURNING id`,
            [sourceId]
        );
        console.log(`  deleted ${articles.rowCount} articles (chunks + cross_references cascade automatically)`);

        const diffs = await client.query(`DELETE FROM document_diffs WHERE source_id = $1 RETURNING id`, [sourceId]);
        console.log(`  deleted ${diffs.rowCount} document_diffs`);

        const docs = await client.query(`DELETE FROM documents WHERE source_id = $1 RETURNING id`, [sourceId]);
        console.log(`  deleted ${docs.rowCount} documents`);

        const runs = await client.query(`DELETE FROM ingestion_runs WHERE source_id = $1 RETURNING id`, [sourceId]);
        console.log(`  deleted ${runs.rowCount} ingestion_runs`);

        const snaps = await client.query(`DELETE FROM source_snapshots WHERE source_id = $1 RETURNING id`, [sourceId]);
        console.log(`  deleted ${snaps.rowCount} source_snapshots`);

        await client.query(`DELETE FROM sources WHERE id = $1`, [sourceId]);
        console.log(`  deleted source row (tenant_subscriptions, if any, cascade automatically)`);

        await client.query("COMMIT");
        console.log("Done.");
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("FAILED, rolled back:", err.message);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

const slug = process.argv[2];
if (!slug) {
    console.error("Usage: node scripts/remove-source.js <slug>");
    process.exit(1);
}
removeSource(slug).catch(() => process.exit(1));