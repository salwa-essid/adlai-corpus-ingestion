const pool = require("../config/database");
const { saveChunk } = require("./chunkRepository");
const { chunkArticle } = require("../services/chunkService");
const { normalizeArabic } = require("../services/normalizationService");
const { generateEmbedding } = require("../services/embeddingService");
const {
    extractCrossReferences
} = require("../services/crossReferenceExtractor");
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
            );
            `,
            [documentId]
        );

        // Delete old articles
        await client.query(
            `
            DELETE FROM articles
            WHERE document_id = $1;
            `,
            [documentId]
        );

        let ordering = 1;

        for (const article of articles) {

            const isArabic = article.language === "ar";

            const normalized = isArabic
                ? normalizeArabic(article.text)
                : "";

            const query = `
                INSERT INTO articles (
                    document_id,
                    article_number,
                    ordering,
                    text_ar,
                    text_en,
                    text_ar_normalized
                )
                VALUES ($1,$2,$3,$4,$5,$6)
                RETURNING id;
            `;

            const values = [
                documentId,
                article.article_number?.toString() || null,
                ordering++,
                isArabic ? article.text : "",
                isArabic ? "" : article.text,
                normalized
            ];

            const result = await client.query(query, values);

            const articleId = result.rows[0].id;

// Extract internal references
            await extractCrossReferences(
                documentId,
                articleId,
                article.text
            );

            const chunks = chunkArticle(article);

            for (const chunk of chunks) {

                // Generate embedding
                const embedding = await generateEmbedding(
                    chunk.chunkText
                );

                await saveChunk(client, {
                    articleId,
                    chunkIndex: chunk.chunkIndex,
                    chunkText: chunk.chunkText,
                    chunkTextNormalized: chunk.chunkTextNormalized,
                    tokenCount: chunk.tokenCount,
                    embeddingModel: "mock-1024",
                    embeddingAr: embedding,
                    embeddingEn: null
                });
            }
        }

        await client.query("COMMIT");

        console.log(`${articles.length} articles saved.`);

    } catch (error) {

        await client.query("ROLLBACK");
        throw error;

    } finally {

        client.release();

    }
}
async function findArticleByNumber(documentId, articleNumber) {
    const query = `
        SELECT id
        FROM articles
        WHERE document_id = $1
          AND article_number = $2
        LIMIT 1;
    `;

    const { rows } = await pool.query(query, [
        documentId,
        articleNumber
    ]);

    return rows[0] || null;
}

module.exports = {
    saveArticles,findArticleByNumber
};