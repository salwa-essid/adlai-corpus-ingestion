const pool = require("../config/database");

async function startIngestionRun(sourceId, inputUrl = null) {
    const query = `
        INSERT INTO ingestion_runs (
            source_id,
            status,
            parser_version,
            input_url
        )
        VALUES ($1, 'running', 'v1.0', $2)
        RETURNING id;
    `
    const { rows } = await pool.query(query, [
        sourceId,
        inputUrl
    ])
    return rows[0].id;
}
async function completeIngestionRun(runId, stats) {
    const query = `
        UPDATE ingestion_runs
        SET
            completed_at = NOW(),
            status = 'success',
            documents_created = $2,
            articles_created = $3,
            chunks_created = $4
        WHERE id = $1;
    `;

    await pool.query(query, [
        runId,
        stats.documents,
        stats.articles,
        stats.chunks
    ]);
}

module.exports = {
    startIngestionRun,
    completeIngestionRun
};