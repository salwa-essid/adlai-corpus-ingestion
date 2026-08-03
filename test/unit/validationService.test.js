const test = require("node:test");
const assert = require("node:assert/strict");
const { validateArticles } = require("../../src/services/validationService");

test("validateArticles: accepts a well-formed article array", () => {
    assert.equal(
        validateArticles("test_source", [{ text: "Article one text." }]),
        true
    );
});
test("validateArticles: rejects non-array input", () => {
    assert.throws(
        () => validateArticles("test_source", { text: "not an array" }),
        /Invalid JSON format/
    );
});

test("validateArticles: rejects an empty array", () => {
    assert.throws(() => validateArticles("test_source", []), /No articles found/);
});
test("validateArticles: rejects when the first article has no text", () => {
    assert.throws(
        () => validateArticles("test_source", [{ article_number: "1" }]),
        /no text/
    );
});
test("validateArticles: rejects scraped website chrome instead of legal text", () => {
    assert.throws(
        () =>
            validateArticles("test_source", [
                { text: "Government Website Registered - Privacy Policy" }
            ]),
        /Looks like website content/
    );
});