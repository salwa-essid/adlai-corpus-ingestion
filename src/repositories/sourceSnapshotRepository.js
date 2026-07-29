const pool = require("../config/database");

async function saveSnapshot(snapshot) {
    const query = `
        INSERT INTO source_snapshots (
            source_id,
            fetched_at,
            content_hash,
            storage_ref,
            content_type
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
    `
    const values = [
        snapshot.sourceId,
        snapshot.fetchedAt,
        snapshot.contentHash,
        snapshot.storageRef,
        snapshot.contentType
    ]
    const { rows } = await pool.query(query, values);
    return rows[0].id;
}

module.exports = {
    saveSnapshot
};