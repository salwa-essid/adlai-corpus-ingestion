const crypto = require("crypto");

/**
 * Temporary embedding generator.
 * TODO:
 * Replace with Cohere/OpenAI embedding API.
 */
async function generateEmbedding(text) {

    const hash = crypto
        .createHash("sha256")
        .update(text)
        .digest();

    const vector = [];

    for (let i = 0; i < 1024; i++) {
        vector.push(hash[i % hash.length] / 255);
    }

    // pgvector expects: [0.1,0.2,0.3]
    return `[${vector.join(",")}]`;
}

module.exports = {
    generateEmbedding
};