function analyzeImpact(diffSummary) {
    if (diffSummary.updated_articles.length > 0) {
        return "Legal content updated. Re-index recommended.";
    }
    if (diffSummary.added_articles.length > 0) {
        return "New legal articles added.";
    }
    if (diffSummary.removed_articles.length > 0) {
        return "Legal articles removed.";
    }
    return "No significant legal impact.";
}
module.exports = {
    analyzeImpact
};