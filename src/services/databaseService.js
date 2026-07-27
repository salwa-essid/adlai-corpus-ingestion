const pool = require("../config/database");

async function testConnection() {
    try {
        await pool.query("SELECT NOW()");
        console.log("[SUCCESS] Database Connected");
    } catch (error) {
        throw new Error(`Database connection failed: ${error.message}`);
    }
}

module.exports = {
    testConnection,
};