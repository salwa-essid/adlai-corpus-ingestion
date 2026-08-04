const test = require("node:test");
const assert = require("node:assert/strict");
const { search } = require("../../src/services/searchService");
test("Hybrid search should return relevant results", async () => {
    const results = await search(
        "المادة الأولى",
        5
    );
    assert.ok(results.length > 0);
    for (const result of results) {
        assert.ok(result.id);
        assert.ok(result.article_id);
        assert.ok(result.article_number);
        assert.ok(result.source_code);
        assert.ok(result.chunk_text);
        assert.ok(result.score > 0);
    }
});