const {
    findArticleByNumber
} = require("../repositories/articleRepository");

const {
    saveCrossReference
} = require("../repositories/crossReferenceRepository");

/**
 * Extract references like:
 * المادة (12)
 * المادة 12
 * Article 12
 * Article (12)
 */
async function extractCrossReferences(documentId, article) {

    const regex =
        /(المادة\s*\(?(\d+)\)?|Article\s*\(?(\d+)\)?)/gi;

    const matches = [...article.text.matchAll(regex)];

    if (!matches.length) {
        return;
    }

    for (const match of matches) {

        const articleNumber = match[2] || match[3];

        if (!articleNumber) {
            continue;
        }

        const target = await findArticleByNumber(
            documentId,
            articleNumber
        );

        if (!target) {
            continue;
        }

        // avoid self-reference
        if (target.id === article.id) {
            continue;
        }

        await saveCrossReference({
            fromArticleId: article.id,
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