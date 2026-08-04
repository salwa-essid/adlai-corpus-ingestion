const test = require("node:test");
const assert = require("node:assert/strict");
const {
    getPendingDiffs,
    updateImpactAnalysis,
    markNotificationSent
} = require("../../src/repositories/documentDiffRepository");
const {
    generateImpactAnalysis
} = require("../../src/services/impactAnalysisService");
test("AI Watch should analyze pending diffs", async () => {
    const pending = await getPendingDiffs();
    assert.ok(Array.isArray(pending));
    if (pending.length === 0) {
        console.log("No pending diffs.");
        return;
    }
    const diff = pending[0];
    const analysis = generateImpactAnalysis(
        diff.diff_summary
    );
    assert.ok(typeof analysis === "string");
    await updateImpactAnalysis(
        diff.id,
        analysis
    );
    await markNotificationSent(
        diff.id
    );
});