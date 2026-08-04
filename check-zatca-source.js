// Quick check: did the issuer fix actually apply to the sources row?
const pool = require("./src/config/database");

(async () => {
    const { rows } = await pool.query(
        `SELECT code, slug, issuer, type FROM sources WHERE slug = 'zatca_einvoicing_regulation'`
    );
    console.log(rows[0] || "not found");
    await pool.end();
})();