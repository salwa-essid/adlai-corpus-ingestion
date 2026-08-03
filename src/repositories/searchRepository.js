const pool = require("../config/database");

// Dense-only (kept for reference / simple cases).
async function searchByEmbedding(embedding, limit = 5) {

    const query = `
        SELECT
            ac.id,
            ac.chunk_text,
            ac.article_id,
            a.article_number,
            d.id AS document_id,
            s.code AS source_code,
            ac.embedding_ar <=> $1 AS distance
        FROM article_chunks ac
            JOIN articles a
        ON ac.article_id = a.id
            JOIN documents d
            ON a.document_id = d.id
            JOIN sources s
            ON d.source_id = s.id
        WHERE ac.embedding_ar IS NOT NULL
        ORDER BY ac.embedding_ar <=> $1
            LIMIT $2;
    `;

    const { rows } = await pool.query(query, [
        embedding,
        limit
    ]);

    return rows;
}

/**
 * Hybrid retrieval per spec 5.3: dense (pgvector cosine distance) +
 * sparse (tsvector/ts_rank) fused by summed score, top `limit` of the
 * combined candidate pool.
 *
 * Deviation from the spec's literal SQL: it FULL OUTER JOINs on
 * (id, article_id, chunk_text) — joining on chunk_text as part of the
 * key is fragile (any whitespace/encoding difference breaks the match
 * and silently duplicates rows). Joining on chunk id alone is the
 * same result and safer, since id is already the real key.
 *
 * normalizedQueryText: pass text already run through the same
 * normalizeArabic() used when the corpus was indexed. Postgres's own
 * unaccent() only strips Latin accents, not Arabic tashkil, so it
 * won't match text_ar_tsv (built from text_ar_normalized) correctly
 * for Arabic queries — see normalizationService.js.
 */
async function searchHybrid(embedding, normalizedQueryText, limit = 5, candidatePoolSize = 40) {

    const query = `
        WITH dense AS (
            SELECT
                ac.id,
                ac.chunk_text,
                ac.article_id,
                1.0 / (1 + (ac.embedding_ar <=> $1)) AS dense_score
            FROM article_chunks ac
            WHERE ac.embedding_ar IS NOT NULL
            ORDER BY ac.embedding_ar <=> $1
            LIMIT $3
        ),
        sparse AS (
            SELECT
                ac.id,
                ac.chunk_text,
                ac.article_id,
                ts_rank(a.text_ar_tsv, plainto_tsquery('simple', $2)) AS sparse_score
            FROM article_chunks ac
            JOIN articles a ON a.id = ac.article_id
            WHERE a.text_ar_tsv @@ plainto_tsquery('simple', $2)
            ORDER BY sparse_score DESC
            LIMIT $3
        ),
        fused AS (
            SELECT
                COALESCE(d.id, sp.id) AS id,
                COALESCE(d.chunk_text, sp.chunk_text) AS chunk_text,
                COALESCE(d.article_id, sp.article_id) AS article_id,
                COALESCE(d.dense_score, 0) + COALESCE(sp.sparse_score, 0) AS score
            FROM dense d
            FULL OUTER JOIN sparse sp ON d.id = sp.id
        )
        SELECT
            f.id,
            f.chunk_text,
            f.article_id,
            f.score,
            a.article_number,
            s.code AS source_code
        FROM fused f
        JOIN articles a ON a.id = f.article_id
        JOIN documents doc ON doc.id = a.document_id
        JOIN sources s ON s.id = doc.source_id
        ORDER BY f.score DESC
        LIMIT $4;
    `;

    const { rows } = await pool.query(query, [
        embedding,
        normalizedQueryText,
        candidatePoolSize,
        limit
    ]);

    return rows;
}

module.exports = {
    searchByEmbedding,
    searchHybrid
};