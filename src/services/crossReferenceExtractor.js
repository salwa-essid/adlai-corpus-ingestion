const {
    saveCrossReference
} = require("../repositories/crossReferenceRepository");
async function extractCrossReferences(
    documentId,
    articleId,
    articleText,
    findArticleByNumber
) {
    const regex = /(?:المادة|Article)\s*\(?(\d+)\)?/gi;
    const matches = [...articleText.matchAll(regex)];
    for (const match of matches) {
        const articleNumber = match[1];
        const target = await findArticleByNumber(
            documentId,
            articleNumber
        );
        if (!target) continue;
        await saveCrossReference({
            fromArticleId: articleId,
            toArticleId: target.id,
            referenceType: "cites",
            confidence: 1.0,
            extractedBy: "rule"
        });
    }
}

module.exports = {
    extractCrossReferences
};