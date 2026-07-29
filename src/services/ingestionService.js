const { readManifest } = require("./manifestService")
const { readArticles } = require("./articleReaderService")
const { validateArticles } = require("./validationService")
const { saveSource } = require("../repositories/sourceRepository")
const { saveDocument } = require("../repositories/documentRepository")
const { saveArticles } = require("../repositories/articleRepository")
const { testConnection } = require("./databaseService")
const logger = require("../utils/logger")
const {
    startIngestionRun,
    completeIngestionRun
} = require("../repositories/ingestionRunRepository")
async function runPipeline() {
    logger.info("ADLAI Corpus Ingestion Pipeline Started...")
    await testConnection();
    const manifest = await readManifest();
    let totalArticles = 0
    for (const source of manifest.sources) {
        logger.info(`Reading ${source.name}...`)
        const articles = await readArticles(source.name)
        validateArticles(source.name, articles)
        // Save Source
        const savedSource = await saveSource(source)
        console.log(`Source saved: ${savedSource.code}`)
        // Start Ingestion Run
        const runId = await startIngestionRun(
            savedSource.id,
            source.url || null
        )
        console.log(`Ingestion Run: ${runId}`)
        // Save Document
        const documentId = await saveDocument({
            sourceId: savedSource.id,
            version: "v1",
            sourceHash: source.name,
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
        logger.success(`${source.name}:${articles.length} articles processed`)
        console.log()
    }
    logger.info(`Total Sources : ${manifest.sources.length}`)
    logger.info(`Total Articles: ${totalArticles}`)
}

module.exports = {
    runPipeline
}