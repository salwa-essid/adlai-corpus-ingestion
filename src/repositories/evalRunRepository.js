const pool = require("../config/database");

async function saveEvalRun(run) {
    const query = `
        INSERT INTO eval_runs (
            eval_version,
            model_config_hash,
            retrieval_config_hash,
            overall_score,
            citation_recall,
            citation_precision,
            results_summary
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id
    `
    const values = [
        run.evalVersion,
        run.modelConfigHash,
        run.retrievalConfigHash,
        run.overallScore,
        run.citationRecall,
        run.citationPrecision,
        JSON.stringify(run.resultsSummary || {})
    ]
    const { rows } = await pool.query(query, values)
    return rows[0].id
}

module.exports = {
    saveEvalRun
}