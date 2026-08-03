const { getEvalQuestionsByVersion } = require("../repositories/evalQuestionRepository");
const { searchHybrid } = require("../repositories/searchRepository");
const { generateEmbedding } = require("./embeddingService");
const { normalizeArabic } = require("./normalizationService");
const { generateContentHash } = require("./hashService");
const { createEvalRun } = require("./evalRunService");
const logger = require("../utils/logger");

const EMBEDDING_MODEL = "embed-multilingual-v3.0";

// Matches spec 5.3's cross-encoder step ("...takes those 20 down to 3"),
// but there is no cross-encoder reranker in this codebase (spec section
// 10 / non-goal: "Semantic reranker inside Postgres — cross-encoder
// stays in the app layer", and the app layer doesn't exist yet either).
// So this measures the *hybrid SQL stage only* — dense+sparse fusion,
// no rerank — against the top-K citations it returns. Treat these
// numbers as an upper bound on what a reranker-equipped pipeline would
// score, not the final production number. Confirm with Alexei once the
// app-layer reranker exists so retrieval_config_hash reflects it.
const DEFAULT_TOP_K = 3;
const DEFAULT_CANDIDATE_POOL = 40;

const RETRIEVAL_CONFIG = {
    strategy: "hybrid_dense_sparse_fusion",
    topK: DEFAULT_TOP_K,
    candidatePoolSize: DEFAULT_CANDIDATE_POOL,
    reranker: "none (app-layer reranker not implemented yet)"
};

function scoreQuestion(expectedCitations, retrievedArticleIds) {
    const expected = new Set((expectedCitations || []).map(String));
    const retrieved = retrievedArticleIds.map(String);

    if (expected.size === 0) {
        return { skipped: true, recall: null, precision: null, hits: 0 };
    }

    const retrievedSet = new Set(retrieved);
    let hits = 0;
    for (const id of expected) {
        if (retrievedSet.has(id)) hits++;
    }

    const recall = hits / expected.size;
    const precision = retrieved.length > 0 ? hits / retrieved.length : 0;

    return { skipped: false, recall, precision, hits };
}

function mean(values) {
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
}
async function runEval(options = {}) {
    const version = options.version || "v1";
    const topK = options.topK || DEFAULT_TOP_K;

    const questions = await getEvalQuestionsByVersion(version);
    if (questions.length === 0) {
        throw new Error(
            `No eval_questions found for version "${version}". ` +
            `Seed eval_questions before running the eval suite.`
        );
    }

    const perQuestion = [];
    const byDomain = {};

    for (const q of questions) {
        const queryText = q.question_ar || q.question_en || "";
        const isArabic = Boolean(q.question_ar);
        const embedding = await generateEmbedding(queryText, "search_query");
        const searchText = isArabic ? normalizeArabic(queryText) : queryText;

        const results = await searchHybrid(
            embedding,
            searchText,
            topK,
            DEFAULT_CANDIDATE_POOL
        );

        const retrievedArticleIds = results.map((r) => r.article_id);
        const score = scoreQuestion(q.expected_citations, retrievedArticleIds);

        perQuestion.push({
            questionId: q.id,
            domain: q.domain,
            ...score
        });

        if (!byDomain[q.domain]) {
            byDomain[q.domain] = { recalls: [], precisions: [], skipped: 0, total: 0 };
        }
        byDomain[q.domain].total++;
        if (score.skipped) {
            byDomain[q.domain].skipped++;
        } else {
            byDomain[q.domain].recalls.push(score.recall);
            byDomain[q.domain].precisions.push(score.precision);
        }
    }

    const scored = perQuestion.filter((p) => !p.skipped);
    const citationRecall = mean(scored.map((p) => p.recall));
    const citationPrecision = mean(scored.map((p) => p.precision));
    const overallScore =
        citationRecall !== null && citationPrecision !== null
            ? (citationRecall + citationPrecision) / 2
            : null;

    const resultsSummary = {
        version,
        topK,
        totalQuestions: questions.length,
        scoredQuestions: scored.length,
        skippedQuestions: perQuestion.length - scored.length,
        byDomain: Object.fromEntries(
            Object.entries(byDomain).map(([domain, d]) => [
                domain,
                {
                    total: d.total,
                    skipped: d.skipped,
                    citationRecall: mean(d.recalls),
                    citationPrecision: mean(d.precisions)
                }
            ])
        ),
        perQuestion
    };

    const modelConfigHash = generateContentHash({ embeddingModel: EMBEDDING_MODEL });
    const retrievalConfigHash = generateContentHash({ ...RETRIEVAL_CONFIG, topK });

    const evalRunId = await createEvalRun({
        evalVersion: version,
        modelConfigHash,
        retrievalConfigHash,
        overallScore,
        citationRecall,
        citationPrecision,
        resultsSummary
    });

    logger.success(
        `Eval run ${evalRunId}: recall@${topK}=${citationRecall?.toFixed(4)} ` +
        `precision@${topK}=${citationPrecision?.toFixed(4)} ` +
        `(${scored.length}/${questions.length} questions scored)`
    );

    return { evalRunId, citationRecall, citationPrecision, overallScore, resultsSummary };
}

module.exports = {
    runEval,
    scoreQuestion
};