function buildDocumentDiff(oldArticles, newArticles) {
    const oldMap = new Map();
    const newMap = new Map();
    for (const article of oldArticles) {
        oldMap.set(article.article_number?.toString(), article.text);
    }
    for (const article of newArticles) {
        newMap.set(article.article_number?.toString(), article.text);
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

        if (previous !== article.text) {
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