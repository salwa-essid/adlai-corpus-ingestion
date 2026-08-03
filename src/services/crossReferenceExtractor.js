const {
    saveCrossReference
} = require("../repositories/crossReferenceRepository");
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
// (?:ال|لل) — covers both "المادة" (bare, or after a prefix like بـ/كـ/فـ
// that doesn't touch the alef) and "للمادة" (لـ + المادة, where Arabic
// orthography elides the alef when lam meets the definite article's
// lam: لـ + المادة -> للمادة, not "لالمادة"). Missing the "لل" form
// dropped real citations: e.g. "وفقاً للمادة الرابعة عشرة" is common
// phrasing across this corpus (verified: 10 occurrences across
// companies.json/zatca_*.json that the bare "الماد[ةه]" pattern
// silently skipped).
const REFERENCE_REGEX = new RegExp(
    "(?:ال|لل)ماد[ةه]\\s+" +
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
    extractCrossReferences,
    // Pure, I/O-free — exported for unit testing (see test/unit/).
    // extractCrossReferences itself always needs a live DB (it calls
    // saveCrossReference directly), so it isn't unit-testable as-is.
    extractOrdinalReferences
};