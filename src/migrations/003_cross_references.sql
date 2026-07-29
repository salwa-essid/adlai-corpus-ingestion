-- ==========================================
-- CROSS REFERENCES
-- ==========================================

CREATE TABLE IF NOT EXISTS cross_references (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_article_id UUID NOT NULL
    REFERENCES articles(id) ON DELETE CASCADE,
    to_article_id UUID NOT NULL
    REFERENCES articles(id) ON DELETE CASCADE,
    reference_type TEXT NOT NULL CHECK (
                                           reference_type IN (
                                           'cites',
                                           'defines',
                                           'modifies',
                                           'supersedes',
                                           'related'
                                                             )
    ),
    confidence DOUBLE PRECISION NOT NULL,
    extracted_by TEXT NOT NULL CHECK (
                                         extracted_by IN (
                                         'manual',
                                         'rule',
                                         'llm'
                                                         )
    )
    );

CREATE INDEX IF NOT EXISTS idx_crossref_from
    ON cross_references(from_article_id);
CREATE INDEX IF NOT EXISTS idx_crossref_to
    ON cross_references(to_article_id);