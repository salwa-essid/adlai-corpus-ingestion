const pool = require("./src/config/database");

(async () => {
    const { rows } = await pool.query(
        "SELECT id, version, domain, question_ar, expected_citations FROM eval_questions;"
    );
    console.log("Total rows:", rows.length);
    console.log(rows);
    await pool.end();
})();