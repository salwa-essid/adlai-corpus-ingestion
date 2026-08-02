const pool = require("../config/database");

const { readManifest } = require("./manifestService");
const { readArticles } = require("./articleReaderService");
const { validateArticles } = require("./validationService");
const { saveSource } = require("../repositories/sourceRepository");
const {
    saveDocument,
    findDocumentByHash,
    findLatestDocument,
    getNextVersion,
    markDocumentSuperseded
} = require("../repositories/documentRepository");
const {
    saveArticles,
    getArticlesByDocumentId
} = require("../repositories/articleRepository");
const {saveSnapshot} = require("../repositories/sourceSnapshotRepository");
const { testConnection } = require("./databaseService");
const logger = require("../utils/logger");
const {
    startIngestionRun,
    completeIngestionRun
} = require("../repositories/ingestionRunRepository");
const {generateContentHash} = require("./hashService");
const {buildDocumentDiff} = require("./documentDiffService");
const {saveDocumentDiff} = require("../repositories/documentDiffRepository");

async function runPipeline(options = {}) {
    logger.info("ADLAI Corpus Ingestion Pipeline Started...");
    await testConnection();
    const manifest = await readManifest();
    const sources = options.source
        ? manifest.sources.filter(
            source =>
                source.name.toUpperCase() ===
                options.source.toUpperCase()
        )
        : manifest.sources;
    let totalArticles = 0;
    for (const source of sources) {
        logger.info(`Reading ${source.name}...`);
        const articles = await readArticles(source.name);
        const sourceHash = generateContentHash(articles);
        validateArticles(source.name, articles);
        // DRY RUN
        if (options.dryRun) {
            logger.info(`[DRY RUN] ${source.name}: ${articles.length} articles validated.`);
            totalArticles += articles.length;
            console.log();
            continue;
        }
        // Save Source
        const savedSource = await saveSource(source);
        console.log(`Source saved: ${savedSource.code}`);
        // Start ingestion run
        const runId = await startIngestionRun(
            savedSource.id,
            source.source_url || null
        );
        console.log(`Ingestion Run: ${runId}`);
        // Save snapshot
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

        // Change detection
        const existingDocument = await findDocumentByHash(
            savedSource.id,
            sourceHash
        );

        if (existingDocument) {
            logger.info(`No changes detected for ${source.name}. Skipping...`);
            await completeIngestionRun(runId, {
                documents: 0,
                articles: 0,
                chunks: 0
            });
            console.log();
            continue;
        }
        // Previous version
        const latestDocument =
            await findLatestDocument(savedSource.id);
        // Next version
        const version =
            await getNextVersion(savedSource.id);
        // Save new document
        const documentId = await saveDocument({
            sourceId: savedSource.id,
            version,
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
        // Mark previous version as superseded
        if (latestDocument) {
            await markDocumentSuperseded(
                latestDocument.id,
                documentId
            );
        }

        // Save Articles + Chunks
        await saveArticles(documentId, articles);
        // Build document diff
        if (latestDocument) {
            const oldArticles =
                await getArticlesByDocumentId(
                    latestDocument.id
                );
            console.log("OLD ARTICLE:");
            console.log(oldArticles[0]);
            console.log("NEW ARTICLE:");
            console.log(articles[0]);
            const diffSummary =
                buildDocumentDiff(
                    oldArticles,
                    articles
                );
            await saveDocumentDiff({
                sourceId: savedSource.id,
                oldDocumentId: latestDocument.id,
                newDocumentId: documentId,
                diffSummary,
                llmImpactAnalysis: null
            });

        }
        // Complete ingestion run
        await completeIngestionRun(runId, {
            documents: 1,
            articles: articles.length,
            chunks: articles.length
        });
        totalArticles += articles.length;
        logger.success(`${source.name}: ${articles.length} articles processed`);
        console.log();
    }

    logger.info(`Total Sources : ${sources.length}`);
    const { rows } = await pool.query("SELECT COUNT(*)::int AS total FROM articles");
    logger.info(`Total Articles in database: ${rows[0].total}`);
    logger.info(`Articles processed this run: ${totalArticles}`);

}

module.exports = {
    runPipeline
};