const pool = require("../config/database");
const { saveChunk } = require("./chunkRepository");
const { chunkArticle } = require("../services/chunkService");
const { normalizeArabic } = require("../services/normalizationService");
const { generateEmbeddings } = require("../services/embeddingService");
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

        // Pass 1: insert every article, and build the full list of
        // chunks across the whole document. Chunks aren't saved yet —
        // embeddings are generated in one batched call below (spec 6.2:
        // "Batched provider call, 100 chunks per batch") instead of one
        // Cohere request per chunk, which burns through the trial rate
        // limit fast on any source with more than a handful of articles.
        const insertedArticles = [];
        const pendingChunks = []; // { articleId, chunkIndex, chunkText, chunkTextNormalized, tokenCount }

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

        // Pass 2: now that every article in this document exists (in this
        // same transaction), extract cross-references. findArticleByNumber
        // uses `client` (not the pool) so it can see these not-yet-committed
        // rows — using the pool here would query a different connection
        // that can't see this transaction's writes yet, so every lookup
        // would silently fail to find a target.
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

        await client.query("COMMIT");

        console.log(`${articles.length} articles saved.`);

    } catch (error) {

        await client.query("ROLLBACK");
        throw error;

    } finally {

        client.release();

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