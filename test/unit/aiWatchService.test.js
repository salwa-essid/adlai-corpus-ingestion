const test = require("node:test");
const assert = require("node:assert/strict");
const { ruleBasedImpact } = require("../../src/services/aiWatchService");

test("ruleBasedImpact: flags updated articles as needing re-index", () => {
    const summary = { updated_articles: [{ article_number: "5" }], added_articles: [], removed_articles: [] };
    assert.equal(ruleBasedImpact(summary), "Legal content updated. Re-index recommended.");
});

test("ruleBasedImpact: flags added articles when nothing was updated", () => {
    const summary = { updated_articles: [], added_articles: [{ article_number: "12" }], removed_articles: [] };
    assert.equal(ruleBasedImpact(summary), "New legal articles added.");
});

test("ruleBasedImpact: flags removed articles when nothing was updated or added", () => {
    const summary = { updated_articles: [], added_articles: [], removed_articles: [{ article_number: "3" }] };
    assert.equal(ruleBasedImpact(summary), "Legal articles removed.");
});

test("ruleBasedImpact: reports no impact when the diff is empty", () => {
    const summary = { updated_articles: [], added_articles: [], removed_articles: [] };
    assert.equal(ruleBasedImpact(summary), "No significant legal impact.");
});