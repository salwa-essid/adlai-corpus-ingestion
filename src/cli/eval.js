const { runEval } = require("../services/evalRunnerService");
const pool = require("../config/database");

function parseArguments() {
    const args = process.argv.slice(2);
    const options = { version: "v1", topK: 3 };
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--version":
                options.version = args[++i];
                break;
            case "--top-k":
                options.topK = parseInt(args[++i], 10);
                break;
        }
    }
    return options;
}

function printDomainTable(byDomain) {
    console.log("\nDomain            Total  Skipped  Recall   Precision");
    console.log("----------------- -----  -------  -------  ---------");
    for (const [domain, d] of Object.entries(byDomain)) {
        const recall = d.citationRecall !== null ? d.citationRecall.toFixed(3) : "n/a";
        const precision = d.citationPrecision !== null ? d.citationPrecision.toFixed(3) : "n/a";
        console.log(
            `${domain.padEnd(18)}${String(d.total).padStart(5)}  ` +
            `${String(d.skipped).padStart(7)}  ${recall.padStart(7)}  ${precision.padStart(9)}`
        );
    }
}

async function main() {
    const options = parseArguments();
    console.log(`Running eval suite: version=${options.version} topK=${options.topK}`);
    try {
        const result = await runEval(options);
        printDomainTable(result.resultsSummary.byDomain);
        console.log(
            `\nOverall: recall=${result.citationRecall?.toFixed(4)} ` +
            `precision=${result.citationPrecision?.toFixed(4)} ` +
            `score=${result.overallScore?.toFixed(4)}`
        );
        console.log(
            `\nCutover gate (spec section 7): compare this eval_run row against the ` +
            `ChromaDB baseline run. Requires recall@3 regression < 1% and eval score ` +
            `regression < 2% before flipping use_postgres_retrieval.`
        );
    } catch (err) {
        console.error(err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();