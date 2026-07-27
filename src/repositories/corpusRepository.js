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

async function saveArticles(sourceName, articles) {
    console.log(`Preparing ${articles.length} articles for ${sourceName}...`);
    // سنضيفها في المرحلة القادمة
}

module.exports = {
    saveSource,
    saveArticles,
};