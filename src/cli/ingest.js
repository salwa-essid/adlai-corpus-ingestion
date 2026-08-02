const { runPipeline } = require("../services/ingestionService");

async function main() {
    try {
        console.log("Starting ADL.AI ingestion...");
        await runPipeline();
        console.log("Ingestion completed.");
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

main();