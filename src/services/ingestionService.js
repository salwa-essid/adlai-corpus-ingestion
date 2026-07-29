const pool = require("../config/database");

const { readManifest } = require("./manifestService");
const { readArticles } = require("./articleReaderService");
const { validateArticles } = require("./validationService");

const { saveSource } = require("../repositories/sourceRepository");

const {
    saveDocument,
    findDocumentByHash
} = require("../repositories/documentRepository");

const { saveArticles } = require("../repositories/articleRepository");

const {
    saveSnapshot
} = require("../repositories/sourceSnapshotRepository");

const { testConnection } = require("./databaseService");

const logger = require("../utils/logger");

const {
    startIngestionRun,
    completeIngestionRun
} = require("../repositories/ingestionRunRepository");

const {
    generateContentHash
} = require("./hashService");

async function runPipeline() {

    logger.info("ADLAI Corpus Ingestion Pipeline Started...");

    await testConnection();

    const manifest = await readManifest();

    let totalArticles = 0;

    for (const source of manifest.sources) {

        logger.info(`Reading ${source.name}...`);

        const articles = await readArticles(source.name);

        const sourceHash = generateContentHash(articles);

        validateArticles(source.name, articles);

        // Save Source
        const savedSource = await saveSource(source);

        console.log(`Source saved: ${savedSource.code}`);

        // Start Ingestion Run
        const runId = await startIngestionRun(
            savedSource.id,
            source.source_url || null
        );

        console.log(`Ingestion Run: ${runId}`);

        // Save Snapshot (always)
        await saveSnapshot({
            sourceId: savedSource.id,
            fetchedAt: source.fetched_at
                ? new Date(source.fetched_at)
                : new Date(),
            contentHash: sourceHash,
            storageRef: source.source_url || "unknown",
            contentType: source.source_url?.endsWith(".pdf")
                ? "application/pdf"
                : "text/html"
        });

        // Change Detection
        const existingDocument = await findDocumentByHash(
            savedSource.id,
            sourceHash
        );

        if (existingDocument) {

            logger.info(
                `No changes detected for ${source.name}. Skipping...`
            );

            await completeIngestionRun(runId, {
                documents: 0,
                articles: 0,
                chunks: 0
            });

            console.log();

            continue;
        }

        // Save Document
        const documentId = await saveDocument({
            sourceId: savedSource.id,
            version: "v1",
            sourceHash,
            sourceUrl: source.source_url,
            language: source.language || "en",
            metadata: {
                status: source.status,
                article_count: source.article_count,
                fetched_at: source.fetched_at
            }
        });

        console.log(`Document created: ${documentId}`);

        // Save Articles + Chunks
        await saveArticles(documentId, articles);

        // Complete Ingestion Run
        await completeIngestionRun(runId, {
            documents: 1,
            articles: articles.length,
            chunks: articles.length
        });

        totalArticles += articles.length;

        logger.success(
            `${source.name}: ${articles.length} articles processed`
        );

        console.log();
    }

    logger.info(`Total Sources : ${manifest.sources.length}`);

    const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS total FROM articles"
    );

    logger.info(
        `Total Articles in database: ${rows[0].total}`
    );

    logger.info(
        `Articles processed this run: ${totalArticles}`
    );
}

module.exports = {
    runPipeline
};