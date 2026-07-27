const { readManifest } = require("./manifestService")
const { readArticles } = require("./articleReaderService")
const { validateArticles } = require("./validationService")
const {
    saveSource,
    saveArticles,
} = require("../repositories/corpusRepository");
const { testConnection } = require("./databaseService");
const logger = require("../utils/logger");

async function runPipeline() {
    logger.info("ADLAI Corpus Ingestion Pipeline Started...")
    await testConnection();
    const manifest = await readManifest()
    let totalArticles = 0;
    for (const source of manifest.sources) {
        logger.info(`Reading ${source.name}...`)
        const articles = await readArticles(source.name)
        validateArticles(source.name, articles)

        const savedSource = await saveSource(source);
        console.log(`Source saved: ${savedSource.code}`);

        await saveArticles(source.name, articles)
        totalArticles += articles.length
        logger.success(`${source.name}: ${articles.length} articles processed`)
        console.log();
    }
    logger.info(`Total Sources : ${manifest.sources.length}`)
    logger.info(`Total Articles: ${totalArticles}`)
}

module.exports = {
    runPipeline
};