const test = require("node:test");
const assert = require("node:assert/strict");
const { generateContentHash } = require("../../src/services/hashService");

test("generateContentHash: is deterministic for identical input", () => {
    const data = { a: 1, b: [1, 2, 3] };
    assert.equal(generateContentHash(data), generateContentHash(data));
});

test("generateContentHash: differs when content changes", () => {
    const hash1 = generateContentHash({ text: "version 1" });
    const hash2 = generateContentHash({ text: "version 2" });
    assert.notEqual(hash1, hash2);
});

test("generateContentHash: produces a 64-char hex SHA-256 digest", () => {
    const hash = generateContentHash({ any: "thing" });
    assert.match(hash, /^[0-9a-f]{64}$/);
});