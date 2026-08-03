const {
    saveCrossReference
} = require("../repositories/crossReferenceRepository");

/**
 * Rule-based extraction of internal article-to-article citations
 * (spec 6.2 step 9).
 *
 * Real KSA legal texts write article numbers as Arabic ORDINAL WORDS
 * ("المادة الرابعة عشرة"), not digits ("المادة 14") — a plain \d+
 * regex matches almost nothing in this corpus. This includes an
 * Arabic ordinal-word -> number parser.
 *
 * Also filters out ARTICLE HEADINGS, not just real citations: legal
 * text always opens with "المادة X: <title>" (colon right after the
 * ordinal) — that's the article naming itself, not citing another
 * article. Without this filter, ~99% of "matches" turn out to be
 * headings, not citations (verified against real data: companies.json
 * alone had 428 raw matches, only 5 were genuine citations after
 * filtering). This also incidentally helps with a separate known
 * upstream data issue where some source files merge several real
 * legal articles into one JSON record — the embedded headings from
 * those merged articles get filtered out the same way.
 *
 * dbClient: pass the transaction client from articleRepository.js so
 * lookups/writes can see the other not-yet-committed articles of the
 * same document. Using the plain pool here would query a separate
 * connection that can't see this transaction's uncommitted rows yet,
 * causing every lookup to fail and every insert to violate the FK
 * constraint against from_article_id.
 */

const UNITS = {
    "الأولى": 1, "الاولى": 1, "الحادية": 1,
    "الثانية": 2,
    "الثالثة": 3,
    "الرابعة": 4,
    "الخامسة": 5,
    "السادسة": 6,
    "السابعة": 7,
    "الثامنة": 8,
    "التاسعة": 9,
    "العاشرة": 10
};

const TENS = {
    "العشرون": 20,
    "الثلاثون": 30,
    "الأربعون": 40,
    "الخمسون": 50,
    "الستون": 60,
    "السبعون": 70,
    "الثمانون": 80,
    "التسعون": 90
};

const REFERENCE_REGEX = new RegExp(
    "الماد[ةه]\\s+" +
    "(" + Object.keys(UNITS).join("|") + ")" +
    "(?:\\s+(عشرة))?" +
    "(?:\\s+و(" + Object.keys(TENS).join("|") + "))?" +
    "(?:\\s+بعد\\s+(المائة|المائتين))?",
    "g"
);

function parseOrdinal(unitWord, hasAshara, tensWord, hundredWord) {
    let value = UNITS[unitWord] || 0;
    if (hasAshara && !tensWord) value += 10;
    if (tensWord) value += TENS[tensWord];
    if (hundredWord === "المائة") value += 100;
    if (hundredWord === "المائتين") value += 200;
    return value;
}

function isHeading(text, matchEndIndex) {
    const after = text.slice(matchEndIndex, matchEndIndex + 3).trimStart();
    return after.startsWith(":") || after.startsWith("：");
}

function extractOrdinalReferences(text) {
    if (!text) return [];

    const results = [];
    let match;
    REFERENCE_REGEX.lastIndex = 0;

    while ((match = REFERENCE_REGEX.exec(text)) !== null) {
        if (isHeading(text, match.index + match[0].length)) continue;

        const [, unitWord, ashara, tensWord, hundredWord] = match;
        const articleNumber = parseOrdinal(unitWord, !!ashara, tensWord, hundredWord);

        if (articleNumber > 0) {
            results.push({ articleNumber, matchedText: match[0] });
        }
    }

    return results;
}

async function extractCrossReferences(
    documentId,
    articleId,
    articleText,
    findArticleByNumber,
    dbClient
) {
    const references = extractOrdinalReferences(articleText);

    for (const ref of references) {
        const target = await findArticleByNumber(documentId, ref.articleNumber);
        if (!target || target.id === articleId) continue; // skip unresolved + self

        await saveCrossReference({
            fromArticleId: articleId,
            toArticleId: target.id,
            referenceType: "cites",
            confidence: 1.0,
            extractedBy: "rule"
        }, dbClient);
    }
}

module.exports = {
    extractCrossReferences
};