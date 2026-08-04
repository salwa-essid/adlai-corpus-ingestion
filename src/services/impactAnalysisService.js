function generateImpactAnalysis(diffSummary) {

    const added = diffSummary.added_articles?.length || 0;
    const updated = diffSummary.updated_articles?.length || 0;
    const removed = diffSummary.removed_articles?.length || 0;

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
Re-generate embeddings if article content changed.
Re-run retrieval evaluation before deployment.
`.trim();

}

module.exports = {
    generateImpactAnalysis
};