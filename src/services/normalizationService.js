function normalizeArabic(text = "") {
    return text
        // Remove Arabic diacritics
        .replace(/[\u064B-\u065F\u0670]/g, "")

        // Normalize letters
        .replace(/[إأآ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ؤ/g, "و")
        .replace(/ئ/g, "ي")
        .replace(/ة/g, "ه")

        // Remove extra spaces
        .replace(/\s+/g, " ")
        .trim();
}

module.exports = {
    normalizeArabic
};