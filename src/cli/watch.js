const { getPendingDiffs } = require("../repositories/documentDiffRepository");
const { updateImpactAnalysis } = require("../repositories/documentDiffRepository");
const { markNotificationSent } = require("../repositories/documentDiffRepository");

const { analyzeImpact } = require("../services/aiWatchService");
async function main() {
    console.log("AI Watch started...");
    const diffs = await getPendingDiffs();
    if (diffs.length === 0) {
        console.log("No pending document diffs.");
        return;
    }
    for (const diff of diffs) {
        const impact = analyzeImpact(diff.diff_summary);
        await updateImpactAnalysis(
            diff.id,
            impact
        );
        await markNotificationSent(
            diff.id
        );
        console.log(`Processed diff ${diff.id}`);
    }
    console.log("AI Watch finished.");
}

main().catch(console.error);