// STORY-100: regenerate output/manifest.json FROM the actual output/*.json
// files instead of hand-editing it. That was exactly the reported issue --
// generated_at stuck on an old date and five files' counts stale (vat
// 134->79, companies 99->281, nca 86->315, cma 66->68, labor 64->65)
// because nothing recomputed the manifest after those rebuilds. Hand-typing
// the right numbers in once would just repeat the same class of bug next
// time a file changes -- this reads the ground truth (the files
// themselves) every time it runs.
//
// article_count, language and fetched_at are all derived from the file's
// own entries (not carried over from the old manifest), so this can never
// drift from reality the way a hand-edited manifest can:
//   - article_count = entries.length
//   - language       = sorted unique `language` values across entries,
//                       comma-joined (e.g. "ar", or "ar,en" for a source
//                       whose entries split into both) -- describes the
//                       *source*, same meaning the field always had, just
//                       computed instead of asserted.
//   - fetched_at     = entries[0].fetched_at (all entries of one source
//                       share one real fetch event) -- null only if the
//                       source genuinely has no real timestamp yet.
//   - law_type       = entries[0].law_type (added 2026-09, see schema.json)
//
// Anything sync-from-scraper.js/prepare-misa.js track that isn't derivable
// from the exported JSON itself (status, note) is preserved from the
// existing manifest.json when present, since those come from the scrape
// step, not the export.
//
// Usage: node scripts/regenerate-manifest.js

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function getSourceCommitSha() {
    // Per the release contract: stamp the manifest with the commit it was
    // generated from, so downstream `ingestion_runs` can attribute a
    // release to an exact repo state. Reads live HEAD at generation time --
    // if this ever runs
    // outside a git checkout (or git isn't on PATH), don't fail the whole
    // manifest over it, just warn and leave it null.
    try {
        return execSync("git rev-parse HEAD", { cwd: path.join(__dirname, ".."), stdio: ["ignore", "pipe", "ignore"] })
            .toString()
            .trim();
    } catch (err) {
        console.warn("!! could not resolve source_commit_sha via `git rev-parse HEAD` -- leaving it null");
        return null;
    }
}

function main() {
    const outputDir = path.join(__dirname, "..", "output");
    const manifestPath = path.join(outputDir, "manifest.json");

    const existing = fs.existsSync(manifestPath)
        ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
        : { sources: [] };
    const existingBySlug = Object.fromEntries(
        (existing.sources || []).map((s) => [s.name, s])
    );

    const files = fs.readdirSync(outputDir)
        .filter((f) => f.endsWith(".json") && f !== "manifest.json")
        .sort();

    const sources = [];
    for (const file of files) {
        const slug = file.replace(/\.json$/, "");
        const data = JSON.parse(fs.readFileSync(path.join(outputDir, file), "utf8"));
        if (!Array.isArray(data) || data.length === 0) {
            console.warn(`!! ${file}: empty or not an array -- skipping`);
            continue;
        }

        const languages = [...new Set(data.map((e) => e.language).filter(Boolean))].sort();
        const fetchedAts = [...new Set(data.map((e) => e.fetched_at))];
        // All entries of one source should share one fetch event. If they
        // don't (yet), surface that loudly instead of silently picking one
        // -- and use the earliest non-null value as the best available
        // proxy for "when this document was actually fetched" (a later,
        // slightly different timestamp on a handful of entries is more
        // often a one-off record fix than a genuine re-fetch).
        if (fetchedAts.length > 1) {
            console.warn(`!! ${slug}: entries disagree on fetched_at (${fetchedAts.join(", ")}) -- using the earliest, but this file needs a look`);
        }
        const earliestFetchedAt = fetchedAts
            .filter((v) => v)
            .sort()[0] ?? null;

        const prev = existingBySlug[slug] || {};
        const entry = {
            name: slug,
            status: prev.status || "success",
            article_count: data.length,
            language: languages.join(","),
            law_type: data[0].law_type || null,
            source_url: data[0].source_url || prev.source_url,
            fetched_at: earliestFetchedAt,
        };
        if (prev.note) entry.note = prev.note;
        sources.push(entry);
    }

    const manifest = {
        generated_at: new Date().toISOString(),
        source_commit_sha: getSourceCommitSha(),
        sources,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

    console.log(`output/manifest.json regenerated: ${sources.length} sources, ${sources.reduce((n, s) => n + s.article_count, 0)} total entries.`);
}

main();
