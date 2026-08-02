const { generateEmbedding } = require("../services/embeddingService");
const { searchByEmbedding } = require("../repositories/searchRepository");
const pool = require("../config/database");

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
                options.limit = parseInt(args[++i], 10);
                break;
        }
    }
    return options;
}

async function main() {
    const options = parseArguments();

    if (!options.query) {
        console.error('Usage: node src/cli/search.js --query "<text>" [--limit N]');
        process.exit(1);
    }
    try {
        console.log(`Searching for: "${options.query}"`);
        const embedding = await generateEmbedding(options.query);
        const results = await searchByEmbedding(embedding, options.limit);
        if (results.length === 0) {
            console.log("No results found.");
            return;
        }
        results.forEach((r, i) => {
            console.log(
                `\n${i + 1}. [${r.source_code}] Article ${r.article_number} ` +
                `(distance: ${Number(r.distance).toFixed(4)})`
            );
            console.log(`   ${r.chunk_text.slice(0, 150)}...`);
        });
    } catch (err) {
        console.error(err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();