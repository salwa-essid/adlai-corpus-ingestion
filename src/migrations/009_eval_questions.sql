-- ==========================================
-- EVAL QUESTIONS
-- ==========================================

CREATE TABLE IF NOT EXISTS eval_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version TEXT NOT NULL,
    domain TEXT NOT NULL
    CHECK (
              domain IN (
              'companies',
              'labor',
              'cma',
              'zatca',
              'sama',
              'nca',
              'misa',
              'pdpl'
                        )
    ),
    question_ar TEXT,
    question_en TEXT,
    expected_citations JSONB,
    accepted_answer_ranges JSONB,
    attorney_rubric TEXT,
    graded_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
    )

CREATE INDEX IF NOT EXISTS idx_eval_questions_domain
    ON eval_questions(domain);
CREATE INDEX IF NOT EXISTS idx_eval_questions_version
    ON eval_questions(version);