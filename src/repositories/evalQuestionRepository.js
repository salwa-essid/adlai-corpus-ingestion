const pool = require("../config/database");

async function saveEvalQuestion(question) {
    const query = `
        INSERT INTO eval_questions (
            version,
            domain,
            question_ar,
            question_en,
            expected_citations,
            accepted_answer_ranges,
            attorney_rubric,
            graded_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id;
    `
    const values = [
        question.version,
        question.domain,
        question.questionAr,
        question.questionEn,
        JSON.stringify(question.expectedCitations || []),
        JSON.stringify(question.acceptedAnswerRanges || []),
        question.attorneyRubric || null,
        question.gradedBy || null
    ]
    const { rows } = await pool.query(query, values)
    return rows[0].id
}

module.exports = {
    saveEvalQuestion
}