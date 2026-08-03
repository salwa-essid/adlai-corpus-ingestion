const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDocumentDiff } = require("../../src/services/documentDiffService");

test("buildDocumentDiff: detects added articles", () => {
    const oldArticles = [{ article_number: "1", text: "a" }];
    const newArticles = [
        { article_number: "1", text: "a" },
        { article_number: "2", text: "b" }
    ];
    const diff = buildDocumentDiff(oldArticles, newArticles);
    assert.deepEqual(diff.added_articles, [{ article_number: "2" }]);
    assert.deepEqual(diff.updated_articles, []);
    assert.deepEqual(diff.removed_articles, []);
});
test("buildDocumentDiff: detects removed articles", () => {
    const oldArticles = [
        { article_number: "1", text: "a" },
        { article_number: "2", text: "b" }
    ];
    const newArticles = [{ article_number: "1", text: "a" }];
    const diff = buildDocumentDiff(oldArticles, newArticles);
    assert.deepEqual(diff.removed_articles, [{ article_number: "2" }]);
});
test("buildDocumentDiff: detects updated (content-changed) articles", () => {
    const oldArticles = [{ article_number: "1", text: "old text" }];
    const newArticles = [{ article_number: "1", text: "new text" }];
    const diff = buildDocumentDiff(oldArticles, newArticles);
    assert.deepEqual(diff.updated_articles, [
        { article_number: "1", change: "content_changed" }
    ]);
});
test("buildDocumentDiff: identical documents produce an empty diff", () => {
    const articles = [{ article_number: "1", text: "same" }];
    const diff = buildDocumentDiff(articles, articles);
    assert.deepEqual(diff, {
        added_articles: [],
        updated_articles: [],
        removed_articles: []
    });
});
test("buildDocumentDiff: handles empty old document (first ingest)", () => {
    const newArticles = [{ article_number: "1", text: "a" }];
    const diff = buildDocumentDiff([], newArticles);
    assert.deepEqual(diff.added_articles, [{ article_number: "1" }]);
});