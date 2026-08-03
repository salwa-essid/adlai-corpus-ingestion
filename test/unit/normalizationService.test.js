const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeArabic } = require("../../src/services/normalizationService");

test("normalizeArabic: strips tashkil (diacritics)", () => {
    const withDiacritics = "الشَّرِكَةُ المُسَاهِمَة";
    const result = normalizeArabic(withDiacritics);
    assert.ok(!/[ً-ٰٟ]/.test(result), "diacritics should be removed");
});
test("normalizeArabic: normalizes alef variants to bare alef", () => {
    assert.equal(normalizeArabic("إجراء"), "اجراء");
    assert.equal(normalizeArabic("أحكام"), "احكام");
    assert.equal(normalizeArabic("آخر"), "اخر");
});
test("normalizeArabic: normalizes ya/alef-maksura and hamza variants", () => {
    assert.equal(normalizeArabic("على"), "علي");
    assert.equal(normalizeArabic("مسؤول"), "مسوول");
    assert.equal(normalizeArabic("مسئول"), "مسيول");
});
test("normalizeArabic: normalizes ta-marbuta to ha", () => {
    assert.equal(normalizeArabic("الشركة"), "الشركه");
});
test("normalizeArabic: collapses whitespace and trims", () => {
    assert.equal(normalizeArabic("  كلمة   أخرى  "), "كلمه اخري");
});
test("normalizeArabic: handles empty/undefined input without throwing", () => {
    assert.equal(normalizeArabic(""), "");
    assert.equal(normalizeArabic(), "");
});