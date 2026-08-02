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
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
    `;

    const values = [
        diff.sourceId,
        diff.oldDocumentId,
        diff.newDocumentId,
        JSON.stringify(diff.diffSummary || {}),
        diff.llmImpactAnalysis || null
    ];

    const { rows } = await pool.query(query, values);
    return rows[0].id;
}

async function updateImpactAnalysis(diffId, analysis) {
    const query = `
        UPDATE document_diffs
        SET llm_impact_analysis = $1
        WHERE id = $2;
    `;

    await pool.query(query, [analysis, diffId]);
}

async function getPendingDiffs() {
    const query = `
        SELECT
            id,
            diff_summary
        FROM document_diffs
        WHERE llm_impact_analysis IS NULL
        ORDER BY detected_at ASC;
    `;

    const { rows } = await pool.query(query);
    return rows;
}

async function markNotificationSent(diffId) {
    const query = `
        UPDATE document_diffs
        SET notified_at = NOW()
        WHERE id = $1;
    `;

    await pool.query(query, [diffId]);
}

module.exports = {
    saveDocumentDiff,
    updateImpactAnalysis,
    getPendingDiffs,
    markNotificationSent
};