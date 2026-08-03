const test = require("node:test");
const assert = require("node:assert/strict");
const { chunkArticle } = require("../../src/services/chunkService");

test("chunkArticle: article under 512 tokens is not split", () => {
    const text = new Array(100).fill("كلمة").join(" ");
    const chunks = chunkArticle({ text, language: "ar" });
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].tokenCount, 100);
    assert.equal(chunks[0].chunkIndex, 1);
});
test("chunkArticle: empty article produces zero chunks", () => {
    const chunks = chunkArticle({ text: "", language: "ar" });
    assert.equal(chunks.length, 0);
});
test("chunkArticle: article over 512 tokens splits with 50-token overlap, never exceeding 512/chunk", () => {
    const tokens = new Array(1100).fill(0).map((_, i) => `tok${i}`);
    const text = tokens.join(" ");
    const chunks = chunkArticle({ text, language: "ar" });

    assert.ok(chunks.length > 1, "expected more than one chunk");
    for (const c of chunks) {
        assert.ok(c.tokenCount <= 512, `chunk exceeded 512 tokens: ${c.tokenCount}`);
    }
    // Verify the 50-token overlap: token at the start of chunk N+1 should
    // be the token 50 positions before the end of chunk N.
    const firstChunkTokens = chunks[0].chunkText.split(" ");
    const secondChunkTokens = chunks[1].chunkText.split(" ");
    const expectedOverlapStart = firstChunkTokens[firstChunkTokens.length - 50];
    assert.equal(secondChunkTokens[0], expectedOverlapStart);
});
test("chunkArticle: chunk indices are sequential starting at 1", () => {
    const tokens = new Array(1600).fill(0).map((_, i) => `w${i}`);
    const chunks = chunkArticle({ text: tokens.join(" "), language: "ar" });
    chunks.forEach((c, i) => assert.equal(c.chunkIndex, i + 1));
});
test("chunkArticle: normalizes Arabic text, leaves non-Arabic chunks untouched", () => {
    const arChunks = chunkArticle({ text: "الشَّرِكَة المساهمة", language: "ar" });
    assert.notEqual(arChunks[0].chunkTextNormalized, arChunks[0].chunkText);

    const enChunks = chunkArticle({ text: "The Company Law", language: "en" });
    assert.equal(enChunks[0].chunkTextNormalized, enChunks[0].chunkText);
});