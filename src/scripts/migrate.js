require("dotenv").config()

const fs = require("fs/promises")
const path = require("path");
const pool = require("../config/database")

async function runMigrations() {
    const client = await pool.connect();
    try {
        console.log("Starting migrations...\n");
        // Create migrations tracking table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                migration_name TEXT UNIQUE NOT NULL,
                executed_at TIMESTAMPTZ DEFAULT NOW()
            )
        `)
        const migrationsDir = path.join(__dirname, "..", "migrations")
        const files = (await fs.readdir(migrationsDir))
            .filter(file => file.endsWith(".sql"))
            .sort();
        for (const file of files) {
            const exists = await client.query(
                `
                SELECT 1
                FROM schema_migrations
                WHERE migration_name = $1
                `,
                [file]
            )
            if (exists.rowCount > 0) {
                console.log(`⏭ Skipping ${file}`)
                continue
            }
            console.log(`▶ Running ${file}`)
            const sql = await fs.readFile(
                path.join(migrationsDir, file),
                "utf8"
            )
            await client.query("BEGIN")
            await client.query(sql)
            await client.query(
                `
                INSERT INTO schema_migrations(migration_name)
                VALUES($1)
                `,
                [file]
            )
            await client.query("COMMIT")
            console.log(`✅ Applied ${file}\n`)
        }
        console.log("🎉 All migrations completed successfully.")
    } catch (err) {
        await client.query("ROLLBACK")
        console.error("Migration failed:")
        console.error("Message:", err.message)
        console.error("Position:", err.position)
        console.error("File:", err.file)
        console.error("Routine:", err.routine)
    } finally {
        client.release()
        await pool.end()
    }
}
runMigrations()