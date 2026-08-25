require("dotenv").config();

const COHERE_API_KEY = process.env.COHERE_API_KEY;
const COHERE_CHAT_MODEL = "command-r";

if (!COHERE_API_KEY) {
    console.warn(
        "[WARN] COHERE_API_KEY not set in .env — AI Watch will fall back to " +
        "the rule-based impact summary instead of a real LLM analysis."
    );
}

function ruleBasedImpact(diffSummary) {
    if (diffSummary.updated_articles.length > 0) {
        return "Legal content updated. Re-index recommended.";
    }
    if (diffSummary.added_articles.length > 0) {
        return "New legal articles added.";
    }
    if (diffSummary.removed_articles.length > 0) {
        return "Legal articles removed.";
    }
    return "No significant legal impact.";
}

function buildPrompt(diffSummary) {
    const added = diffSummary.added_articles || [];
    const updated = diffSummary.updated_articles || [];
    const removed = diffSummary.removed_articles || [];
    return [
        "You are a legal-compliance assistant. A regulatory source document",
        "just changed. In 2-3 plain-English sentences, summarize the",
        "practical impact for a legal/compliance team: which articles",
        "changed, and whether re-review or re-indexing is needed.",
        "Only use the article numbers given below — do not invent article",
        "content you were not given.",
        "",
        `Added articles (${added.length}): ${added.map((a) => a.article_number).join(", ") || "none"}`,
        `Updated articles (${updated.length}): ${updated.map((a) => a.article_number).join(", ") || "none"}`,
        `Removed articles (${removed.length}): ${removed.map((a) => a.article_number).join(", ") || "none"}`
    ].join("\n");
}

async function callCohereChat(prompt, attempt = 1) {
    const response = await fetch("https://api.cohere.com/v1/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${COHERE_API_KEY}`
        },
        body: JSON.stringify({
            model: COHERE_CHAT_MODEL,
            message: prompt,
            temperature: 0.2
        })
    });

    if (response.status === 429 && attempt <= 3) {
        const waitMs = attempt * 5000;
        console.warn(
            `[WARN] Cohere chat rate limit hit, retrying in ${waitMs / 1000}s ` +
            `(attempt ${attempt}/3)...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        return callCohereChat(prompt, attempt + 1);
    }
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Cohere chat request failed (${response.status}): ${errorBody}`);
    }
    const data = await response.json();
    return (data.text || "").trim();
}

async function analyzeImpact(diffSummary) {
    if (!COHERE_API_KEY) {
        return ruleBasedImpact(diffSummary);
    }
    try {
        const prompt = buildPrompt(diffSummary);
        const analysis = await callCohereChat(prompt);
        return analysis || ruleBasedImpact(diffSummary);
    } catch (error) {
        console.error(
            "[AI Watch] Cohere impact analysis failed, falling back to rule-based summary:",
            error.message
        );
        return ruleBasedImpact(diffSummary);
    }
}

module.exports = {
    analyzeImpact,
    ruleBasedImpact
};