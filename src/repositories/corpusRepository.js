const pool = require("../config/database");

async function saveSource(source) {
    const query = `
        INSERT INTO sources (
            code,
            type,
            issuer,
            jurisdiction,
            language_primary
        )
        VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (code)
        DO UPDATE SET
            updated_at = NOW()
                           RETURNING *;
    `;

    const values = [
        source.name.toUpperCase(),
        "regulation",
        "Unknown",
        "SA",
        source.language || "unknown",
    ];

    const result = await pool.query(query, values);

    return result.rows[0];
}

async function saveArticles(documentId, articles) {

    let ordering = 1;

    for (const article of articles) {

        const query = `
            INSERT INTO articles (
                document_id,
                article_number,
                ordering,
                text_ar,
                text_en,
                text_ar_normalized
            )
            VALUES ($1, $2, $3, $4, $5, $6);
        `;

        const isArabic = article.language === "ar";

        const values = [
            documentId,
            article.article_number?.toString() || null,
            ordering++,
            isArabic ? article.text : "",
            isArabic ? "" : article.text,
            isArabic ? article.text : ""
        ];

        await pool.query(query, values);
    }

    console.log(`${articles.length} articles saved.`);
}

module.exports = {
    saveSource,
    saveArticles,
};