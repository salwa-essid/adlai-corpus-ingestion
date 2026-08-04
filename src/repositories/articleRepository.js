const pool = require("../config/database");
const { saveChunk } = require("./chunkRepository");
const { chunkArticle } = require("../services/chunkService");
const { normalizeArabic } = require("../services/normalizationService");
const { generateEmbeddings } = require("../services/embeddingService");
const {
    extractCrossReferences
} = require("../services/crossReferenceExtractor");
async function saveArticles(documentId, articles, externalClient = null) {
    const client = externalClient || await pool.connect();
    const ownsTransaction = !externalClient;
    try {
        if (ownsTransaction) await client.query("BEGIN");
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
        const insertedArticles = [];
        const pendingChunks = []; // { articleId, chunkIndex, chunkText, chunkTextNormalized, tokenCount }
        const arabicScriptPattern = /[؀-ۿ]/;
        for (const article of articles) {
            const isArabic =
                article.language === "ar" ||
                arabicScriptPattern.test(article.text || "");
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
            insertedArticles.push({ articleId, text: article.text });
            const chunks = chunkArticle(article);
            for (const chunk of chunks) {
                pendingChunks.push({
                    articleId,
                    chunkIndex: chunk.chunkIndex,
                    chunkText: chunk.chunkText,
                    chunkTextNormalized: chunk.chunkTextNormalized,
                    tokenCount: chunk.tokenCount
                });
            }
        }

        // Batched embedding call(s) for every chunk in this document.
        if (pendingChunks.length > 0) {
            const embeddings = await generateEmbeddings(
                pendingChunks.map((c) => c.chunkText),
                "search_document"
            );
            for (let i = 0; i < pendingChunks.length; i++) {
                await saveChunk(client, {
                    articleId: pendingChunks[i].articleId,
                    chunkIndex: pendingChunks[i].chunkIndex,
                    chunkText: pendingChunks[i].chunkText,
                    chunkTextNormalized: pendingChunks[i].chunkTextNormalized,
                    tokenCount: pendingChunks[i].tokenCount,
                    embeddingModel: "embed-multilingual-v3.0",
                    embeddingAr: embeddings[i],
                    embeddingEn: null
                });
            }
        }
        const findArticleByNumberInTx = (docId, articleNumber) =>
            findArticleByNumber(docId, articleNumber, client);
        for (const { articleId, text } of insertedArticles) {
            await extractCrossReferences(
                documentId,
                articleId,
                text,
                findArticleByNumberInTx,
                client
            );
        }
        if (ownsTransaction) await client.query("COMMIT");
        console.log(`${articles.length} articles saved.`);
    } catch (error) {
        if (ownsTransaction) await client.query("ROLLBACK");
        throw error;
    } finally {
        if (ownsTransaction) client.release();

    }
}

async function findArticleByNumber(documentId, articleNumber, dbClient = pool) {
    const query = `
        SELECT id
        FROM articles
        WHERE document_id = $1
          AND article_number = $2
        LIMIT 1;
    `;

    const { rows } = await dbClient.query(query, [
        documentId,
        articleNumber
    ]);
    return rows[0] || null;
}
async function getArticlesByDocumentId(documentId) {

    const query = `
        SELECT
            article_number,
            COALESCE(text_ar, text_en) AS text
        FROM articles
        WHERE document_id = $1
        ORDER BY ordering;
    `;
    const { rows } = await pool.query(query, [documentId]);
    return rows;
}

module.exports = {
    saveArticles, findArticleByNumber, getArticlesByDocumentId
};