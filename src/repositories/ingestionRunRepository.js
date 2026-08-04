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

// Records a real failure instead of leaving the run stuck at 'running'
// (or, worse, having the caller silently swallow the error and never
// mark it at all — which is what happened before this run's document
// could end up with 0 articles and no trace of why in ingestion_runs).
async function failIngestionRun(runId, errorMessage) {
    const query = `
        UPDATE ingestion_runs
        SET
            completed_at = NOW(),
            status = 'failed',
            error_log = $2::jsonb
        WHERE id = $1;
    `;
    await pool.query(query, [
        runId,
        JSON.stringify({ message: errorMessage })
    ]);
}
module.exports = {
    startIngestionRun,
    completeIngestionRun,
    failIngestionRun
};