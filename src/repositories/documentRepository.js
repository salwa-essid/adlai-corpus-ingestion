const pool = require("../config/database");

async function findDocumentByHash(sourceId, sourceHash) {
    const query = `
        SELECT id
        FROM documents
        WHERE source_id = $1
          AND source_hash = $2
            LIMIT 1;
    `;
    const { rows } = await pool.query(query, [
        sourceId,
        sourceHash
    ]);
    return rows[0] || null;
}
async function findLatestDocument(sourceId) {
    const query = `
        SELECT
            id,
            version,
            source_hash,
            created_at
        FROM documents
        WHERE source_id = $1
        ORDER BY created_at DESC
            LIMIT 1;
    `;
    const { rows } = await pool.query(query, [sourceId]);
    return rows[0] || null;
}
async function getNextVersion(sourceId) {
    const query = `
        SELECT version
        FROM documents
        WHERE source_id = $1
        ORDER BY created_at DESC
            LIMIT 1;
    `;
    const { rows } = await pool.query(query, [sourceId]);
    if (rows.length === 0) {
        return "v1";
    }
    const current = rows[0].version || "v1";
    const number = parseInt(
        current.replace("v", ""),
        10
    );
    return `v${number + 1}`;
}
// dbClient lets the caller (ingestionService) run this inside the SAME
// transaction as saveArticles. Without that, saveDocument commits the
// document row (and its source_hash) on the pool immediately; if
// saveArticles then fails, the document is left permanently stuck with
// 0 articles but a source_hash that matches the current file — so every
// future ingest run sees "no changes detected" and skips it forever.
// Defaulting to `pool` keeps every existing caller (diagnostics, tests)
// working unchanged.
async function saveDocument(document, dbClient = pool) {
    const query = `
        INSERT INTO documents (
            source_id,
            version,
            source_hash,
            source_url,
            language,
            metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id;
    `;
    const values = [
        document.sourceId,
        document.version,
        document.sourceHash,
        document.sourceUrl,
        document.language,
        JSON.stringify(document.metadata)
    ];
    const { rows } = await dbClient.query(query, values);
    return rows[0].id;
}
async function markDocumentSuperseded(oldDocumentId, newDocumentId, dbClient = pool) {
    const query = `
        UPDATE documents
        SET superseded_by = $2
        WHERE id = $1;
    `;
    await dbClient.query(query, [
        oldDocumentId,
        newDocumentId
    ]);
}
module.exports = {
    findDocumentByHash,
    findLatestDocument,
    getNextVersion,
    saveDocument,
    markDocumentSuperseded
};