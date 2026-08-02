const pool = require("../config/database");

async function getSubscribedTenants(sourceId) {
    const query = `
        SELECT
            ts.tenant_id,
            t.name AS tenant_name
        FROM tenant_subscriptions ts
        JOIN tenants t ON t.id = ts.tenant_id
        WHERE ts.source_id = $1;
    `;

    const { rows } = await pool.query(query, [sourceId]);
    return rows;
}

module.exports = {
    getSubscribedTenants
};