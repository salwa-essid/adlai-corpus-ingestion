function validateArticles(sourceName, articles) {
    if (!Array.isArray(articles)) {
        throw new Error(`${sourceName}: Invalid JSON format.`)
    }
    if (articles.length === 0) {
        throw new Error(`${sourceName}: No articles found.`)
    }
    const firstArticle = articles[0];
    // Dual-language articles (text_ar + text_en) carry no single `text`
    // field — accept those too, as long as at least one side has content.
    const firstArticleText =
        firstArticle.text || firstArticle.text_ar || firstArticle.text_en;
    if (!firstArticleText) {
        throw new Error(`${sourceName}: First article has no text.`)
    }
    const forbiddenWords = [
        "government website registered",
        "privacy policy",
        "cookies",
        "skip to content"
    ];
    const text = firstArticleText.toLowerCase();
    for (const word of forbiddenWords) {
        if (text.includes(word)) {
            throw new Error(
                `${sourceName}: Invalid source. Looks like website content instead of legal articles.`
            )
        }
    }
    return true
}

module.exports = {
    validateArticles
};