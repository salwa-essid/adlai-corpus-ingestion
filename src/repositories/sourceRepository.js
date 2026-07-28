const pool = require("../config/database")

async function saveSource(source) {
    const query = `
        INSERT INTO sources (
            code,
            type,
            issuer,
            jurisdiction,
            language_primary
        )
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (code)
        DO UPDATE SET updated_at = NOW()
        RETURNING *;
    `

    const values = [
        source.name.toUpperCase(),
        "regulation",
        "Unknown",
        "SA",
        source.language || "unknown"
    ]
    const { rows } = await pool.query(query, values);
    return rows[0];
}

module.exports = {
    saveSource
}