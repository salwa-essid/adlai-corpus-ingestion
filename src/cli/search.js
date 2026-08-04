const pool = require("../config/database");
const { search } = require("../services/searchService");

function parseArguments() {

    const args = process.argv.slice(2);
    const options = {
        query: null,
        limit: 5
    };
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--query":
                options.query = args[++i];
                break;
            case "--limit":
                options.limit = parseInt(
                    args[++i],
                    10
                );
                break;
        }
    }

    return options;
}

async function main() {
    const options = parseArguments();
    if (!options.query) {
        console.error(
            'Usage: node src/cli/search.js --query "<text>" [--limit N]'
        );
        process.exit(1);
    }
    try {
        console.log(`Searching for: "${options.query}"`);
        const results = await search(
            options.query,
            options.limit
        );
        if (results.length === 0) {
            console.log("No results found.");
        } else {
            results.forEach((result, index) => {
                console.log(`\n${index + 1}. [${result.source_code}] Article ${result.article_number} (score: ${Number(result.score).toFixed(4)})`);
                console.log(`${result.chunk_text.slice(0, 150)}...`);

            });

        }

    } catch (error) {

        console.error(error);
        process.exit(1);
    } finally {
        await pool.end();
    }

}

main();