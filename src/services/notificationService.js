/**
 * Stands in for a real delivery channel (email/webhook/Slack — not
 * specified in the spec). Logs the notification per subscribed tenant
 * so the "who got notified about what" trail exists even before a
 * real channel is wired in.
 */
async function notifyDiff(diff, tenant) {
    console.log(
        `[NOTIFICATION] tenant=${tenant.tenant_name} (${tenant.tenant_id}) ` +
        `-> document diff for source ${diff.source_id}: ${diff.impact}`
    );
    return true;
}
module.exports = {
    notifyDiff
};