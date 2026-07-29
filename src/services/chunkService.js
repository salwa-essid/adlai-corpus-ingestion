function chunkArticle(article) {

    const text = article.text
    return [
        {
            chunkIndex: 1,
            chunkText: text,
            chunkTextNormalized: text,
            tokenCount: text.split(/\s+/).length,
            embeddingModel: null
        }
    ];
}
module.exports = {
    chunkArticle
};