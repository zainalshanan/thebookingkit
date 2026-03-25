import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Run custom SQL migrations that Drizzle doesn't handle
 * (extensions, exclusion constraints, triggers, functions).
 */
export async function runCustomMigrations(databaseUrl: string) {
  const sql = postgres(databaseUrl);

  const migrationFiles = [
    "0001_setup_extensions.sql",
    "0002_booking_audit_trigger.sql",
    "0003_gdpr_anonymize.sql",
    "0004_create_booking_function.sql",
    "0005_resources.sql",
  ];

  for (const file of migrationFiles) {
    const filePath = join(__dirname, "migrations", file);
    const migration = readFileSync(filePath, "utf-8");
    console.log(`Running migration: ${file}`);
    await sql.unsafe(migration);
    console.log(`  Done: ${file}`);
  }

  await sql.end();
  console.log("All custom migrations complete.");
}

// Run directly if executed as script
const isMainModule = process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname;
if (isMainModule) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }
  runCustomMigrations(databaseUrl).catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
