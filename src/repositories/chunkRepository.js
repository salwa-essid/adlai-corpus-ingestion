const pool = require("../config/database")

async function saveChunk(client, chunk) {
    const query = `
        INSERT INTO article_chunks (
            article_id,
            chunk_index,
            chunk_text,
            chunk_text_normalized,
            token_count,
            embedding_model
        )
        VALUES ($1,$2,$3,$4,$5,$6);
    `
    await client.query(query, [
        chunk.articleId,
        chunk.chunkIndex,
        chunk.chunkText,
        chunk.chunkTextNormalized,
        chunk.tokenCount,
        chunk.embeddingModel
    ])
}

module.exports = {
    saveChunk
}