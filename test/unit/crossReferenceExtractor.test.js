const test = require("node:test");
const assert = require("node:assert/strict");
const { extractOrdinalReferences } = require("../../src/services/crossReferenceExtractor");

test("extractOrdinalReferences: parses a simple ordinal citation", () => {
    const text = "وفقاً لأحكام المادة الرابعة من هذا النظام يجب على المنشأة...";
    const refs = extractOrdinalReferences(text);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].articleNumber, 4);
});
test("extractOrdinalReferences: parses teens (X + عشرة)", () => {
    const text = "طبقاً لأحكام المادة الرابعة عشرة من النظام...";
    const refs = extractOrdinalReferences(text);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].articleNumber, 14);
});
test("extractOrdinalReferences: parses compound tens (X وY-ون)", () => {
    const text = "عملاً بالمادة الثالثة والعشرون من النظام...";
    const refs = extractOrdinalReferences(text);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].articleNumber, 23);
});
test("extractOrdinalReferences: filters out article headings (colon immediately after ordinal)", () => {
    // "المادة الأولى: التعريفات" is the article naming itself, not a
    // citation to another article — this is the ~99%-of-matches case
    // documented in the source (companies.json: 428 raw matches, 5
    // real citations after this filter).
    const heading = "المادة الأولى: التعريفات";
    assert.equal(extractOrdinalReferences(heading).length, 0);
});
test("extractOrdinalReferences: a real citation elsewhere in the same text still matches after a heading", () => {
    const text =
        "المادة الأولى: التعريفات. يُقصد بالمصطلحات الواردة في هذا النظام، " +
        "ما لم يقتض السياق خلاف ذلك، وفقاً لأحكام المادة الثانية عشرة.";
    const refs = extractOrdinalReferences(text);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].articleNumber, 12);
});

test("extractOrdinalReferences: returns empty array for text with no citations", () => {
    assert.deepEqual(extractOrdinalReferences("لا يوجد أي إشارة هنا."), []);
});

test("extractOrdinalReferences: matches the fused preposition form (لل + مادة), not just bare المادة", () => {
    // Arabic elides the alef when lam (ل, meaning "to/for") prefixes
    // the definite article: "لـ" + "المادة" -> "للمادة", never
    // "لالمادة". This phrasing ("وفقاً للمادة...", "طبقاً للمادة...")
    // is common in this corpus and was previously silently dropped.
    const text = "وذلك وفقاً للمادة الرابعة عشرة من النظام.";
    const refs = extractOrdinalReferences(text);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].articleNumber, 14);
});

test("extractOrdinalReferences: handles empty/undefined input", () => {
    assert.deepEqual(extractOrdinalReferences(""), []);
    assert.deepEqual(extractOrdinalReferences(undefined), []);
});