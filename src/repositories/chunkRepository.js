


async function saveChunk(client, chunk) {

    const query = `
        INSERT INTO article_chunks (

            article_id,

            chunk_index,

            chunk_text,

            chunk_text_normalized,

            token_count,

            embedding_model,

            embedding_ar,

            embedding_en

        )

        VALUES (

            $1,$2,$3,$4,$5,$6,$7,$8

        );
    `;

    await client.query(query, [

        chunk.articleId,

        chunk.chunkIndex,

        chunk.chunkText,

        chunk.chunkTextNormalized,

        chunk.tokenCount,

        chunk.embeddingModel,

        chunk.embeddingAr,

        chunk.embeddingEn

    ]);

}

module.exports = {
    saveChunk
};