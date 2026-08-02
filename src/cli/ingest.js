const { runPipeline } = require("../services/ingestionService");

function parseArguments() {
    const args = process.argv.slice(2);
    const options = {
        source: null,
        url: null,
        dryRun: false
    };
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--source":
                options.source = args[++i];
                break;
            case "--url":
                options.url = args[++i];
                break;
            case "--dry-run":
                options.dryRun = true;
                break;
        }
    }
    return options;
}
async function main() {
    try {
        const options = parseArguments();
        console.log("Starting ADL.AI ingestion...");
        console.log(options);
        await runPipeline(options);
        console.log("Ingestion completed.");
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
main();