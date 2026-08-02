function generateImpactAnalysis(diffSummary) {
    const added = diffSummary.added_articles.length;
    const updated = diffSummary.updated_articles.length;
    const removed = diffSummary.removed_articles.length;
    if (
        added === 0 &&
        updated === 0 &&
        removed === 0
    ) {
        return "No legal changes detected.";
    }
    return `
Changes detected:
- Added articles: ${added}
- Updated articles: ${updated}
- Removed articles: ${removed}
Recommendation:
Review changes before updating embeddings and search indexes.
`.trim();
}

module.exports = {
    generateImpactAnalysis
};