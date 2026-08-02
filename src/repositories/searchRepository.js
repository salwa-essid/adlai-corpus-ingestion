const pool = require("../config/database");

async function searchByEmbedding(embedding, limit = 5) {

    const query = `
        SELECT
            ac.id,
            ac.chunk_text,
            ac.article_id,
            a.article_number,
            d.id AS document_id,
            s.code AS source_code,
            ac.embedding_ar <=> $1 AS distance
        FROM article_chunks ac
        JOIN articles a
            ON ac.article_id = a.id
        JOIN documents d
            ON a.document_id = d.id
        JOIN sources s
            ON d.source_id = s.id
        WHERE ac.embedding_ar IS NOT NULL
        ORDER BY ac.embedding_ar <=> $1
        LIMIT $2;
    `;

    const { rows } = await pool.query(query, [
        embedding,
        limit
    ]);

    return rows;
}

module.exports = {
    searchByEmbedding
};