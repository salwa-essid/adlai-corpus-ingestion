const pool = require("../config/database");

async function saveDocumentDiff(diff) {
    const query = `
        INSERT INTO document_diffs (
            source_id,
            old_document_id,
            new_document_id,
            diff_summary,
            llm_impact_analysis
        )
        VALUES ($1,$2,$3,$4,$5)
        RETURNING id;
    `
    const values = [
        diff.sourceId,
        diff.oldDocumentId,
        diff.newDocumentId,
        JSON.stringify(diff.diffSummary || {}),
        diff.llmImpactAnalysis || null
    ]
    const { rows } = await pool.query(query, values)
    return rows[0].id
}

module.exports = {
    saveDocumentDiff
}