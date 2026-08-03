const pool = require("../config/database");
async function getOrCreateDevTenant() {
    const existing = await pool.query(
        `SELECT id FROM tenants WHERE name = $1 LIMIT 1;`,
        ["CLI Dev Tenant"]
    );
    if (existing.rows[0]) return existing.rows[0].id;
    const created = await pool.query(
        `INSERT INTO tenants (name, data_residency) VALUES ($1, $2) RETURNING id;`,
        ["CLI Dev Tenant", "standard"]
    );
    return created.rows[0].id;
}

module.exports = {
    getOrCreateDevTenant
};