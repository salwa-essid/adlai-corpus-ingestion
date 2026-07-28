-- ===========================
-- ADLAI Initial Schema
-- ===========================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- =====================================
-- SOURCES
-- =====================================

CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    code TEXT UNIQUE NOT NULL,

    type TEXT NOT NULL CHECK (
                                 type IN (
                                 'statute',
                                 'regulation',
                                 'bulletin',
                                 'decree',
                                 'ruling',
                                 'guidance'
                                         )
    ),

    issuer TEXT,

    jurisdiction TEXT DEFAULT 'SA',

    language_primary TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW()
    );

-- =====================================
-- INGESTION RUNS
-- =====================================

CREATE TABLE IF NOT EXISTS ingestion_runs (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    source_id UUID REFERENCES sources(id),

    started_at TIMESTAMPTZ DEFAULT NOW(),

    completed_at TIMESTAMPTZ,

    status TEXT CHECK (
                          status IN (
                          'running',
                          'success',
                          'failed',
                          'partial'
                                    )
    ),

    parser_version TEXT,

    input_url TEXT,

    documents_created INTEGER DEFAULT 0,

    articles_created INTEGER DEFAULT 0,

    chunks_created INTEGER DEFAULT 0,

    error_log JSONB
    );

-- =====================================
-- DOCUMENTS
-- =====================================

CREATE TABLE IF NOT EXISTS documents (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    source_id UUID NOT NULL REFERENCES sources(id),

    version TEXT,

    effective_date DATE,

    publication_date DATE,

    superseded_by UUID REFERENCES documents(id),

    source_url TEXT,

    source_hash TEXT NOT NULL,

    ingestion_run_id UUID REFERENCES ingestion_runs(id),

    language TEXT,

    title_ar TEXT,

    title_en TEXT,

    metadata JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_source_version
    ON documents(source_id, version);

CREATE INDEX IF NOT EXISTS idx_documents_hash
    ON documents(source_hash);

-- =====================================
-- ARTICLES
-- =====================================

CREATE TABLE IF NOT EXISTS articles (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id),
    article_number TEXT,
    parent_article_id UUID REFERENCES articles(id),
    ordering INTEGER NOT NULL,
    title_ar TEXT,
    title_en TEXT,
    text_ar TEXT NOT NULL,
    text_en TEXT,
    text_ar_normalized TEXT,
    text_ar_tsv tsvector GENERATED ALWAYS AS (
                                                 to_tsvector('simple', COALESCE(text_ar_normalized, ''))
    ) STORED,
    text_en_tsv tsvector GENERATED ALWAYS AS (
                                                 to_tsvector('english', COALESCE(text_en, ''))
    ) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW()
    )
CREATE INDEX IF NOT EXISTS idx_articles_document
    ON articles(document_id, ordering);
CREATE INDEX IF NOT EXISTS idx_articles_ar_tsv
    ON articles
    USING GIN(text_ar_tsv);
CREATE INDEX IF NOT EXISTS idx_articles_en_tsv
    ON articles
    USING GIN(text_en_tsv);
-- =====================================
-- ARTICLE CHUNKS
-- =====================================

CREATE TABLE IF NOT EXISTS article_chunks (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,

    chunk_index INTEGER NOT NULL,

    chunk_text TEXT NOT NULL,

    chunk_text_normalized TEXT,

    token_count INTEGER DEFAULT 0,

    embedding_model TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_chunks_article
    ON article_chunks(article_id);