const pool = require("../config/database");

async function saveCrossReference(reference, dbClient = pool) {
    const query = `
        INSERT INTO cross_references (
            from_article_id,
            to_article_id,
            reference_type,
            confidence,
            extracted_by
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
    `
    const values = [
        reference.fromArticleId,
        reference.toArticleId,
        reference.referenceType,
        reference.confidence,
        reference.extractedBy
    ]
    const { rows } = await dbClient.query(query, values)
    return rows[0].id
}

module.exports = {
    saveCrossReference
};