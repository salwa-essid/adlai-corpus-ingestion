-- ==========================================
-- EVAL RUNS
-- ==========================================

CREATE TABLE IF NOT EXISTS eval_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    eval_version TEXT NOT NULL,
    model_config_hash TEXT NOT NULL,
    retrieval_config_hash TEXT NOT NULL,
    run_at TIMESTAMPTZ DEFAULT NOW(),
    overall_score FLOAT,
    citation_recall FLOAT,
    citation_precision FLOAT,
    results_summary JSONB
    )

CREATE INDEX IF NOT EXISTS idx_eval_runs_version
    ON eval_runs(eval_version);
CREATE INDEX IF NOT EXISTS idx_eval_runs_run_at
    ON eval_runs(run_at);