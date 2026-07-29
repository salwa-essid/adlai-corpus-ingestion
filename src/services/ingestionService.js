const pool = require("../config/database");
const { readManifest } = require("./manifestService")
const { readArticles } = require("./articleReaderService")
const { validateArticles } = require("./validationService")
const { saveSource } = require("../repositories/sourceRepository")
const {
    saveDocument,
    findDocumentByHash
} = require("../repositories/documentRepository")
const { saveArticles } = require("../repositories/articleRepository")
const { testConnection } = require("./databaseService")
const logger = require("../utils/logger")
const {
    startIngestionRun,
    completeIngestionRun
} = require("../repositories/ingestionRunRepository")
const { generateContentHash } = require("./hashService");


async function runPipeline() {
    logger.info("ADLAI Corpus Ingestion Pipeline Started...")
    await testConnection()
    const manifest = await readManifest()
    let totalArticles = 0
    for (const source of manifest.sources) {
        logger.info(`Reading ${source.name}...`)
        const articles = await readArticles(source.name)
        const sourceHash = generateContentHash(articles)
        validateArticles(source.name, articles);
        // Save Source
        const savedSource = await saveSource(source);
        console.log(`Source saved: ${savedSource.code}`)
        // Start Ingestion Run
        const runId = await startIngestionRun(
            savedSource.id,
            source.url || null
        )
        console.log(`Ingestion Run: ${runId}`);
        // Check if document already exists
        const existingDocument = await findDocumentByHash(
            savedSource.id,
            sourceHash
        )
        if (existingDocument) {
            logger.info(`No changes detected for ${source.name}. Skipping...`)
            await completeIngestionRun(runId, {
                documents: 0,
                articles: 0,
                chunks: 0
            })
            console.log();
            continue;
        }
        // Save Document
        const documentId = await saveDocument({
            sourceId: savedSource.id,
            version: "v1",
            sourceHash,
            language: source.language || "en",
        })
        console.log(`Document created: ${documentId}`)
        // Save Articles + Chunks
        await saveArticles(documentId, articles);
        // Complete Ingestion Run
        await completeIngestionRun(runId, {
            documents: 1,
            articles: articles.length,
            chunks: articles.length
        })
        totalArticles += articles.length
        logger.success(`${source.name}: ${articles.length} articles processed`)
        console.log()
    }
    logger.info(`Total Sources : ${manifest.sources.length}`)
    const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS total FROM articles"
    )
    logger.info(`Total Articles in database: ${rows[0].total}`)
    logger.info(`Articles processed this run: ${totalArticles}`)
}

module.exports = {
    runPipeline
}