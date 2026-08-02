function buildDocumentDiff(oldArticles, newArticles) {

    const oldMap = new Map();
    for (const article of oldArticles) {
        oldMap.set(article.article_number, article.text);
    }
    let added = 0;
    let updated = 0;
    for (const article of newArticles) {
        const previous = oldMap.get(article.article_number);
        if (!previous) {
            added++;
            continue;
        }
        if (previous !== article.text) {
            updated++;
        }
    }
    return {
        added_articles: added,
        updated_articles: updated,
        removed_articles: 0
    };
}

module.exports = {
    buildDocumentDiff
};