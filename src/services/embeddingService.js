require("dotenv").config();

const COHERE_API_KEY = process.env.COHERE_API_KEY;
const COHERE_MODEL = "embed-multilingual-v3.0"; // 1024d, matches vector(1024) columns
const BATCH_SIZE = 90; // Cohere allows up to 96 texts/call; stay under with margin

if (!COHERE_API_KEY) {
    console.warn(
        "[WARN] COHERE_API_KEY not set in .env — embeddings will fail. " +
        "Get a free key at https://dashboard.cohere.com/api-keys"
    );
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callCohereEmbed(texts, inputType, attempt = 1) {
    const response = await fetch("https://api.cohere.com/v1/embed", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${COHERE_API_KEY}`
        },
        body: JSON.stringify({
            texts,
            model: COHERE_MODEL,
            input_type: inputType
        })
    });

    if (response.status === 429 && attempt <= 5) {
        // Trial key rate limit (100 calls/min). Back off and retry
        // instead of failing the whole ingestion run.
        const waitMs = attempt * 5000;
        console.warn(
            `[WARN] Cohere rate limit hit, retrying in ${waitMs / 1000}s ` +
            `(attempt ${attempt}/5)...`
        );
        await sleep(waitMs);
        return callCohereEmbed(texts, inputType, attempt + 1);
    }

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
            `Cohere embedding request failed (${response.status}): ${errorBody}`
        );
    }

    const data = await response.json();
    return data.embeddings;
}

/**
 * Batch embedding: texts in, pgvector-formatted strings out, same order.
 * Splits into chunks of BATCH_SIZE per spec 6.2 ("Batched provider call,
 * 100 chunks per batch") and Cohere's own per-call limit (96 texts).
 *
 * inputType: "search_document" for content being indexed, "search_query"
 * for a user's search text — required by Cohere v3 models, and mixing
 * them up quietly hurts retrieval quality without erroring.
 */
async function generateEmbeddings(texts, inputType = "search_document") {
    if (texts.length === 0) return [];

    const results = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const embeddings = await callCohereEmbed(batch, inputType);
        results.push(...embeddings.map((v) => `[${v.join(",")}]`));
    }

    return results;
}

// Convenience single-text wrapper (e.g. for a single search query).
async function generateEmbedding(text, inputType = "search_document") {
    const [embedding] = await generateEmbeddings([text], inputType);
    return embedding;
}

module.exports = {
    generateEmbedding,
    generateEmbeddings
};