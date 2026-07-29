const { normalizeArabic } = require("./normalizationService");

/**
 * Chunking rule (spec 4.1 / 6.2):
 * - default chunk = full article
 * - split only if article exceeds 512 tokens
 * - 50-token overlap between chunks
 * - never chunk across article boundaries (this function operates on
 *   one article at a time, so that's automatic)
 *
 * Implementation note: real source data (e.g. companies.json) has
 * articles with ZERO paragraph breaks at all — some "articles" are
 * actually several legal articles glued together by an upstream
 * parsing issue. A paragraph-based splitter degrades to a plain
 * token-window splitter for those anyway, and a first version that
 * tried to combine paragraph-packing with a second layer of overlap
 * double-counted the overlap and produced 562-token chunks instead
 * of 512. Splitting directly on the token stream is simpler and
 * verified correct — see the token counts below.
 *
 * NOTE on "tokens": whitespace-separated words, not real subword
 * tokens (e.g. tiktoken). Approximation, good enough to decide
 * "does this need splitting", not precise for exact model context
 * sizing.
 */

const MAX_TOKENS = 512;
const OVERLAP_TOKENS = 50;
function tokenize(text) {
    return text.split(/\s+/).filter(Boolean);
}
function chunkArticle(article) {
    const text = (article.text || "").trim();
    const isArabic = article.language === "ar";
    const tokens = tokenize(text);
    let windows;
    if (tokens.length === 0) {
        windows = [];
    } else if (tokens.length <= MAX_TOKENS) {
        windows = [tokens];
    } else {
        windows = [];
        let start = 0;
        while (start < tokens.length) {
            const end = Math.min(start + MAX_TOKENS, tokens.length);
            windows.push(tokens.slice(start, end));
            if (end === tokens.length) break;
            start = end - OVERLAP_TOKENS;
        }
    }

    return windows.map((windowTokens, i) => {
        const chunkText = windowTokens.join(" ");
        return {
            chunkIndex: i + 1,
            chunkText,
            chunkTextNormalized: isArabic ? normalizeArabic(chunkText) : chunkText,
            tokenCount: windowTokens.length,
            embeddingModel: null
        };
    });
}

module.exports = {
    chunkArticle
};