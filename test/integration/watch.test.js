const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const originalCwd = process.cwd();
let dbAvailable = false;
let pool;

test.before(async () => {
    pool = require(path.join(originalCwd, "src/config/database"));
    try {
        await pool.query("SELECT 1");
        dbAvailable = true;
    } catch {
        dbAvailable = false;
    }
});

test.after(async () => {
    if (pool) await pool.end();
});

test("AI Watch should analyze pending diffs", async (t) => {
    if (!dbAvailable) {
        t.skip("Postgres not reachable — run `docker compose up -d && npm run migrate` first");
        return;
    }

    const {
        getPendingDiffs,
        updateImpactAnalysis,
        markNotificationSent
    } = require(path.join(originalCwd, "src/repositories/documentDiffRepository"));
    const { analyzeImpact } = require(path.join(originalCwd, "src/services/aiWatchService"));

    const pending = await getPendingDiffs();
    assert.ok(Array.isArray(pending));
    if (pending.length === 0) {
        console.log("No pending diffs.");
        return;
    }
    const diff = pending[0];
    const analysis = await analyzeImpact(diff.diff_summary);
    assert.ok(typeof analysis === "string");
    await updateImpactAnalysis(diff.id, analysis);
    await markNotificationSent(diff.id);
});