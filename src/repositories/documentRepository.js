const pool = require("../config/database");

async function saveDocument(document) {
    const query = `
        INSERT INTO documents (
            source_id,
            version,
            source_hash,
            language
        )
        VALUES ($1, $2, $3, $4)
            ON CONFLICT (source_id, version)
        DO UPDATE SET
            source_hash = EXCLUDED.source_hash,
                           language = EXCLUDED.language
                           RETURNING id;
    `

    const values = [
        document.sourceId,
        document.version,
        document.sourceHash,
        document.language
    ];
    const { rows } = await pool.query(query, values);
    return rows[0].id;
}

module.exports = {
    saveDocument
};