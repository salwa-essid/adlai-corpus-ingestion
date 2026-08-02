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
const {
    saveDocumentDiff,
    markNotificationSent
} = require("../repositories/documentDiffRepository");
const { testConnection } = require("./databaseService");
const logger = require("../utils/logger");
const {
    startIngestionRun,
    completeIngestionRun
} = require("../repositories/ingestionRunRepository");
const {generateContentHash} = require("./hashService");
const {buildDocumentDiff} = require("./documentDiffService");
const {
    analyzeImpact
} = require("./aiWatchService");
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
        // ---------------- DRY RUN ----------------
        if (options.dryRun) {
            logger.info(`[DRY RUN] ${source.name}: ${articles.length} articles validated.`);
            totalArticles += articles.length;
            console.log();
            continue;
        }
        // ---------------- SOURCE ----------------
        const savedSource = await saveSource(source);
        console.log(`Source saved: ${savedSource.code}`);
        // ---------------- INGESTION RUN ----------------
        const runId = await startIngestionRun(
            savedSource.id,
            source.source_url || null
        );
        console.log(`Ingestion Run: ${runId}`);
        // ---------------- SNAPSHOT ----------------
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
        // ---------------- CHANGE DETECTION ----------------
        const existingDocument =
            await findDocumentByHash(
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
        // ---------------- VERSION ----------------
        const latestDocument =
            await findLatestDocument(savedSource.id);
        const version =
            await getNextVersion(savedSource.id);
        // ---------------- SAVE DOCUMENT ----------------
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
        // ---------------- SUPERSEDED ----------------
        if (latestDocument) {
            await markDocumentSuperseded(
                latestDocument.id,
                documentId
            );
        }
        // ---------------- ARTICLES ----------------
        await saveArticles(documentId, articles);
        // ---------------- DOCUMENT DIFF ----------------
        if (latestDocument) {
            const oldArticles =
                await getArticlesByDocumentId(
                    latestDocument.id
                );
            const diffSummary =
                buildDocumentDiff(
                    oldArticles,
                    articles
                );
            const impact =
                analyzeImpact(diffSummary);
            const diffId =
                await saveDocumentDiff({
                    sourceId: savedSource.id,
                    oldDocumentId:
                    latestDocument.id,
                    newDocumentId:
                    documentId,
                    diffSummary,
                    llmImpactAnalysis:
                    impact
                });

            logger.success(
                "AI Watch notification created."
            );
            // MOCK notification
            await markNotificationSent(diffId);
            logger.success("Notification marked as sent.");
        }
        // ---------------- COMPLETE RUN ----------------
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
    const { rows } = await pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM articles;
        `
    );
    logger.info(`Total Articles in database: ${rows[0].total}`);
    logger.info(`Articles processed this run: ${totalArticles}`);
}

module.exports = {
    runPipeline
};