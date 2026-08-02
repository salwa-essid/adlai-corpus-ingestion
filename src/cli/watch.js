const { runWatch } = require("../services/aiWatchService");
async function main() {
    try {
        await runWatch();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
main();