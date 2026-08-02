const { getPendingDiffs } = require("../repositories/documentDiffRepository");
const { updateImpactAnalysis } = require("../repositories/documentDiffRepository");
const { markNotificationSent } = require("../repositories/documentDiffRepository");
const { getSubscribedTenants } = require("../repositories/tenantSubscriptionRepository");

const { analyzeImpact } = require("../services/aiWatchService");
const { notifyDiff } = require("../services/notificationService");
const pool = require("../config/database");

async function main() {
    console.log("AI Watch started...");
    const diffs = await getPendingDiffs();

    if (diffs.length === 0) {
        console.log("No pending document diffs.");
        await pool.end();
        return;
    }

    for (const diff of diffs) {
        const impact = analyzeImpact(diff.diff_summary);
        await updateImpactAnalysis(diff.id, impact);

        const tenants = await getSubscribedTenants(diff.source_id);

        if (tenants.length === 0) {
            console.log(`Diff ${diff.id}: no subscribed tenants, skipping notification.`);
        } else {
            for (const tenant of tenants) {
                await notifyDiff({ source_id: diff.source_id, impact }, tenant);
            }
        }

        await markNotificationSent(diff.id);
        console.log(`Processed diff ${diff.id}`);
    }

    console.log("AI Watch finished.");
    await pool.end();
}

main().catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
});