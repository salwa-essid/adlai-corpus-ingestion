const pool = require("../config/database");
// Postgres SET/SET LOCAL does not accept bind parameters ($1) — the
// value has to be part of the SQL text. Validate it looks like a UUID
// before interpolating (defense in depth; tenantId always comes from
// our own DB in practice, never raw user input, but this makes it
// safe even if that ever changes).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function withTenantContext(tenantId, callback) {
    if (!UUID_RE.test(tenantId)) {
        throw new Error(`withTenantContext: "${tenantId}" is not a valid UUID`);
    }
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
        const result = await callback(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    withTenantContext
};