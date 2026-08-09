// Dual-language articles (text_ar + text_en) carry no single `text`
// field. Compare on the Arabic (binding) text, same as articleRepository
// does when inserting — falls back to text_en, then plain text.
function getComparableText(article) {
    return article.text_ar || article.text_en || article.text || "";
}

function buildDocumentDiff(oldArticles, newArticles) {
    const oldMap = new Map();
    const newMap = new Map();
    for (const article of oldArticles) {
        oldMap.set(article.article_number?.toString(), getComparableText(article));
    }
    for (const article of newArticles) {
        newMap.set(article.article_number?.toString(), getComparableText(article));
    }
    const added = [];
    const updated = [];
    const removed = [];
    // Added & Updated
    for (const article of newArticles) {
        const articleNumber = article.article_number?.toString();
        const previous = oldMap.get(articleNumber);
        if (!previous) {
            added.push({
                article_number: articleNumber
            });
            continue;
        }

        if (previous !== getComparableText(article)) {
            updated.push({
                article_number: articleNumber,
                change: "content_changed"
            });
        }

    }
    // Removed
    for (const article of oldArticles) {
        const articleNumber = article.article_number?.toString();
        if (!newMap.has(articleNumber)) {
            removed.push({
                article_number: articleNumber
            });
        }
    }
    return {
        added_articles: added,
        updated_articles: updated,
        removed_articles: removed
    };
}
module.exports = {
    buildDocumentDiff
};