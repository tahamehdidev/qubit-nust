// Phase 7A.4 -- Render's free-tier Postgres has no automated backups. Dumps the database to a
// timestamped .sql file via pg_dump, run daily by .github/workflows/backup.yml and uploaded as a
// workflow artifact (free, no extra infrastructure to provision or pay for).
//
// Connects via BACKUP_DATABASE_URL (falls back to ADMIN_DATABASE_URL, migrate.js's own bootstrap
// connection) -- a full dump needs to read everything, which the restricted app_user role
// (DATABASE_URL) isn't guaranteed to have if that ever changes; the owner connection always does.
//
// Usage:
//   node scripts/backup.js
import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

const connectionString = process.env.BACKUP_DATABASE_URL ?? process.env.ADMIN_DATABASE_URL;
if (!connectionString) {
  console.error(
    "Missing BACKUP_DATABASE_URL (or ADMIN_DATABASE_URL) -- set it in .env (see .env.example)."
  );
  process.exit(1);
}

const outputDir = process.env.BACKUP_OUTPUT_DIR ?? path.join(process.cwd(), "backups");

async function backup() {
  await mkdir(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputFile = path.join(outputDir, `backup-${timestamp}.sql`);

  // --no-password: fail loudly instead of hanging on an interactive password prompt if the
  // connection string is somehow missing credentials -- there's no human at the keyboard in CI.
  await execFileAsync("pg_dump", ["--no-password", "--file", outputFile, connectionString]);

  console.log(`Backup written to ${outputFile}`);
}

backup().catch((err) => {
  console.error("Backup failed:", err.message);
  process.exit(1);
});
