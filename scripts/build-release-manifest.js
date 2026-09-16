// STORY-100: packages a tagged release artifact for the `adlai` (Python)
// side to consume, so it can log which exact commit of this repo produced
// the corpus it ingested (per Alex's request).
//
// Why this lives in CI and not in manifestService.js / the ingestion
// pipeline: a commit can't know its own SHA before it's made, so there's
// no clean way to write source_commit_sha into manifest.json as part of a
// normal commit. GitLab CI already knows the SHA of the commit a pipeline
// is running for (CI_COMMIT_SHA) and, on a tag pipeline, the tag itself
// (CI_COMMIT_TAG) -- so this script only ever runs in that context and
// stamps both onto a *copy* of manifest.json, built fresh at release time.
// The committed output/manifest.json in git is never rewritten by this.
//
// Usage (CI only): node scripts/build-release-manifest.js
// Reads:  output/*.json (including manifest.json)
// Writes: dist/output/*.json  (manifest.json enriched, chunk_hash stripped
//         from every domain-file entry)
//
// chunk_hash removal: Alex's contract of record forbids chunk_hash in the
// release (it's computed post-normalization on their side, so ours can
// never match -- "keep it internal, strip it from the release files").
// We keep it in the committed output/*.json (our own linter still
// requires it there, and Salwa's own pipeline/tooling still uses it), and
// only drop it from this dist/ copy, which is what actually ships.
// Non-.json files under output/ (e.g. a stray misa-test.pdf) are never
// picked up here since only *.json is globbed -- so the release artifact
// is already exactly "the 12 JSONs + manifest.json" as asked.

const fs = require("fs");
const path = require("path");

function main() {
    const commitSha = process.env.CI_COMMIT_SHA;
    const tag = process.env.CI_COMMIT_TAG;
    if (!commitSha || !tag) {
        console.error(
            "build-release-manifest.js: CI_COMMIT_SHA and CI_COMMIT_TAG " +
            "must both be set -- this script only runs inside a GitLab " +
            "tag pipeline, not locally."
        );
        process.exit(1);
    }

    const srcDir = path.join(__dirname, "..", "output");
    const destDir = path.join(__dirname, "..", "dist", "output");
    fs.mkdirSync(destDir, { recursive: true });

    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".json"));
    let strippedTotal = 0;
    for (const file of files) {
        if (file === "manifest.json") continue;
        const data = JSON.parse(fs.readFileSync(path.join(srcDir, file), "utf8"));
        const cleaned = data.map(({ chunk_hash, ...rest }) => {
            if (chunk_hash !== undefined) strippedTotal++;
            return rest;
        });
        fs.writeFileSync(
            path.join(destDir, file),
            JSON.stringify(cleaned, null, 2) + "\n"
        );
    }

    const manifestPath = path.join(srcDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.source_commit_sha = commitSha;
    manifest.release_tag = tag;
    fs.writeFileSync(
        path.join(destDir, "manifest.json"),
        JSON.stringify(manifest, null, 2) + "\n"
    );

    console.log(`dist/output/manifest.json stamped with commit ${commitSha} (tag ${tag}).`);
    console.log(`${files.length} domain file(s) copied into dist/output/ (chunk_hash stripped from ${strippedTotal} entries).`);
}

main();
