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
            // Dual-language sources (e.g. bilingual AR/EN PDFs like misa)
            // carry text_ar and text_en as separate fields already split
            // by the scraper/extraction step. Single-language sources
            // (labor, companies, pdpl, cma, nca...) still carry one
            // `text` field + a `language` tag, and fall back to the old
            // binary routing.
            const hasDualText =
                article.text_ar !== undefined || article.text_en !== undefined;
            let arText;
            let enText;
            if (hasDualText) {
                arText = article.text_ar || "";
                enText = article.text_en || "";
            } else {
                const isArabic =
                    article.language === "ar" ||
                    arabicScriptPattern.test(article.text || "");
                arText = isArabic ? article.text : "";
                enText = isArabic ? "" : article.text;
            }
            const normalized = arText ? normalizeArabic(arText) : "";
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
                arText,
                enText,
                normalized
            ];
            const result = await client.query(query, values);
            const articleId = result.rows[0].id;
            // Cross-reference extraction and diffing always run against
            // the Arabic (binding) text when present.
            insertedArticles.push({ articleId, text: arText || enText });
            // Only the Arabic text is chunked/embedded in this pipeline
            // version (embedding_en exists in schema but is unused —
            // see saveChunk below). text_en is stored for reference only,
            // not chunked. Dual-text articles always chunk arText under
            // language "ar"; single-text articles keep the exact same
            // chunkArticle(article) call/behavior as before this change.
            const chunks = hasDualText
                ? chunkArticle({ text: arText, language: "ar" })
                : chunkArticle(article);
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