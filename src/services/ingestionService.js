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
const {saveDocumentDiff} = require("../repositories/documentDiffRepository");
const {buildDocumentDiff} = require("./documentDiffService");
const { testConnection } = require("./databaseService");
const logger = require("../utils/logger");
const {
    startIngestionRun,
    completeIngestionRun,
    failIngestionRun
} = require("../repositories/ingestionRunRepository");
const {generateContentHash} = require("./hashService");
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
        // Every source is isolated in its own try/catch: one source's
        // failure (e.g. a transient embeddings-API error) must not crash
        // the whole run and strand every source after it as "never
        // attempted". Before this fix, an uncaught error here would
        // propagate out of the for-loop entirely.
        let runId = null;
        try {
            logger.info(`Reading ${source.name}...`);
            const articles = await readArticles(source.name);
            const sourceHash = generateContentHash(articles);
            validateArticles(source.name, articles);
            // ---------------- DRY RUN ----------------
            if (options.dryRun) {
                logger.info( `[DRY RUN] ${source.name}: ${articles.length} articles validated.`);
                totalArticles += articles.length;
                console.log();
                continue;
            }
            // ---------------- SOURCE ----------------
            const savedSource = await saveSource(source);
            console.log(`Source saved: ${savedSource.code}`);
            // ---------------- INGESTION RUN ----------------
            runId = await startIngestionRun(
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

            // ---------------- SAVE DOCUMENT + SUPERSEDE + ARTICLES ----------------
            // All three happen in ONE transaction now. Previously,
            // saveDocument() committed immediately on the pool — so if
            // saveArticles() below failed (e.g. Cohere embeddings API
            // error), the document row survived with 0 articles but a
            // source_hash matching the current file. Every later ingest
            // run would then see "no changes detected" and skip it
            // forever, silently, with no articles ever searchable.
            // Making this atomic means a failure here rolls back the
            // document row too, so the next run correctly retries it.
            const txClient = await pool.connect();
            let documentId;
            try {
                await txClient.query("BEGIN");
                documentId = await saveDocument({
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
                }, txClient);

                if (latestDocument) {
                    await markDocumentSuperseded(
                        latestDocument.id,
                        documentId,
                        txClient
                    );
                }

                await saveArticles(documentId, articles, txClient);
                await txClient.query("COMMIT");
            } catch (txError) {
                await txClient.query("ROLLBACK");
                throw txError;
            } finally {
                txClient.release();
            }

            console.log(`Document created: ${documentId}`);
            // --------------- DOCUMENT DIFF ----------------
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
                await saveDocumentDiff({
                    sourceId: savedSource.id,
                    oldDocumentId: latestDocument.id,
                    newDocumentId: documentId,
                    diffSummary,
                    llmImpactAnalysis: null
                });
                logger.success("Document diff created.");
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
        } catch (error) {
            logger.error(`FAILED to ingest ${source.name}: ${error.message}`);
            if (runId) {
                await failIngestionRun(runId, error.message);
            }
            console.log();
            // Move on to the next source instead of crashing the run.
        }
    }
    logger.info(`Total Sources : ${sources.length}`);
    const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM articles`
    );
    logger.info(`Total Articles in database: ${rows[0].total}`);
    logger.info(`Articles processed this run: ${totalArticles}`);
}

module.exports = {
    runPipeline
};