const pool = require("../config/database")
const { saveChunk } = require("./chunkRepository")
const { chunkArticle } = require("../services/chunkService")
const { normalizeArabic } = require("../services/normalizationService")


async function saveArticles(documentId, articles) {

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // Delete old chunks
        await client.query(
            `
            DELETE FROM article_chunks
            WHERE article_id IN (
                SELECT id
                FROM articles
                WHERE document_id = $1
            )
            `,
            [documentId]
        )
        // Delete old articles
        await client.query(
            `
            DELETE FROM articles
            WHERE document_id = $1;
            `,
            [documentId]
        )
        let ordering = 1
        for (const article of articles) {
            const isArabic = article.language === "ar"
            const normalized = isArabic
                ? normalizeArabic(article.text)
                : ""
            const query = `
                INSERT INTO articles (
                    document_id,
                    article_number,
                    ordering,
                    text_ar,
                    text_en,
                    text_ar_normalized
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id;
            `
            const values = [
                documentId,
                article.article_number?.toString() || null,
                ordering++,
                isArabic ? article.text : "",
                isArabic ? "" : article.text,
                normalized
            ]
            const result = await client.query(query, values);
            const articleId = result.rows[0].id;
            const chunks = chunkArticle(article);
            for (const chunk of chunks) {
                await saveChunk(client, {
                    articleId,
                    chunkIndex: chunk.chunkIndex,
                    chunkText: chunk.chunkText,
                    chunkTextNormalized: chunk.chunkTextNormalized,
                    tokenCount: chunk.tokenCount,
                    embeddingModel: chunk.embeddingModel
                });
            }
        }

        await client.query("COMMIT")
        console.log(`${articles.length} articles saved.`)
    } catch (error) {

        await client.query("ROLLBACK");

        throw error;

    } finally {

        client.release();

    }
}

module.exports = {
    saveArticles
};