// Copies a fresh adlai-scraper run into this project's output/ folder, in
// the shape runPipeline() actually reads.
//
// The two projects use different output layouts:
//   scraper:    output/<name>/<name>_articles.json   (one subfolder per source)
//   ingestion:  output/<name>.json                   (flat file, no subfolder)
// but the article array shape inside each file, and the manifest.json
// {sources: [{name, status, article_count, language, source_url,
// fetched_at}, ...]} shape, are already identical — so this is a
// copy + flatten + manifest-merge, not a data transform.
//
// MISA IS SKIPPED ON PURPOSE: the scraper's own generic PDF method
// produces a lower-quality misa extraction (word-jumbled bilingual text,
// not split cleanly per article — see misaParser.js's comments). This
// project's misa.json should come from `node scripts/prepare-misa.js`
// instead, which does real position-based PDF parsing. Running
// sync-from-scraper after prepare-misa.js (or vice versa) would make
// whichever ran last silently win — so this script never touches misa,
// on either the output file or the manifest entry, no matter what's in
// the scraper's output.
//
// Usage:
//   node scripts/sync-from-scraper.js <path-to-adlai-scraper-project>
//
// Example:
//   node scripts/sync-from-scraper.js ../adlai-scrapper

const fs = require("fs");
const path = require("path");

const SKIP_SOURCES = new Set(["misa"]);

function main() {
    const scraperPath = process.argv[2];
    if (!scraperPath) {
        console.error("Usage: node scripts/sync-from-scraper.js <path-to-adlai-scraper-project>");
        console.error("Example: node scripts/sync-from-scraper.js ../adlai-scrapper");
        process.exit(1);
    }

    const scraperOutputDir = path.resolve(scraperPath, "output");
    const scraperManifestPath = path.join(scraperOutputDir, "manifest.json");
    if (!fs.existsSync(scraperManifestPath)) {
        console.error(`Can't find ${scraperManifestPath} — is this the right scraper project path?`);
        process.exit(1);
    }

    const ownOutputDir = path.join(__dirname, "..", "output");
    const ownManifestPath = path.join(ownOutputDir, "manifest.json");
    fs.mkdirSync(ownOutputDir, { recursive: true });

    const scraperManifest = JSON.parse(fs.readFileSync(scraperManifestPath, "utf8"));
    const ownManifest = fs.existsSync(ownManifestPath)
        ? JSON.parse(fs.readFileSync(ownManifestPath, "utf8"))
        : { generated_at: null, sources: [] };

    let copied = 0;
    let skippedMisa = false;
    let skippedNotSuccess = [];

    for (const entry of scraperManifest.sources) {
        if (SKIP_SOURCES.has(entry.name)) {
            skippedMisa = true;
            continue;
        }
        if (entry.status !== "success") {
            skippedNotSuccess.push(`${entry.name} (${entry.status})`);
            continue;
        }

        const articlesPath = path.join(
            scraperOutputDir,
            entry.name,
            `${entry.name}_articles.json`
        );
        if (!fs.existsSync(articlesPath)) {
            console.warn(`  ! ${entry.name}: manifest says success but ${articlesPath} is missing — skipping`);
            continue;
        }

        const destPath = path.join(ownOutputDir, `${entry.name}.json`);
        fs.copyFileSync(articlesPath, destPath);
        copied++;
        console.log(`  copied ${entry.name} -> output/${entry.name}.json (${entry.article_count} articles)`);

        const existingIndex = ownManifest.sources.findIndex((s) => s.name === entry.name);
        const mergedEntry = { ...entry };
        if (existingIndex === -1) {
            ownManifest.sources.push(mergedEntry);
        } else {
            ownManifest.sources[existingIndex] = mergedEntry;
        }
    }

    ownManifest.generated_at = new Date().toISOString();
    fs.writeFileSync(ownManifestPath, JSON.stringify(ownManifest, null, 2) + "\n");

    console.log(`\n${copied} source(s) synced. output/manifest.json updated.`);
    if (skippedMisa) {
        console.log("misa: skipped on purpose (use `node scripts/prepare-misa.js` for that one).");
    }
    if (skippedNotSuccess.length > 0) {
        console.log(`Not synced (not "success" in scraper): ${skippedNotSuccess.join(", ")}`);
    }
    console.log("\nNext: node scripts/prepare-misa.js  (if you haven't already), then npm run ingest");
}

main();