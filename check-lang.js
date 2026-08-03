const pool = require("./src/config/database");

(async () => {
    const { rows } = await pool.query(`
        SELECT s.code, a.article_number,
               length(a.text_ar) AS text_ar_len,
               length(a.text_en) AS text_en_len
        FROM articles a
        JOIN documents d ON d.id = a.document_id
        JOIN sources s ON s.id = d.source_id
        WHERE s.code = 'LABOR_LAW'
        ORDER BY a.ordering
        LIMIT 3;
    `);
    console.log(rows);
    await pool.end();
})();