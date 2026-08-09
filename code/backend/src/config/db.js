import pg from "pg";
import { env } from "./env.js";

// Render's managed Postgres presents a certificate not in Node's default trust store; local
// Docker Compose Postgres has no TLS at all. Gating on NODE_ENV keeps dev/test/CI untouched
// while making the production connection actually work (unset, `new pg.Pool` defaults to no
// SSL, which Render's Postgres rejects outright).
//
// Phase 7A.1 -- pool sizing is env-configurable (env.js's own comment: today's values are
// pg.Pool's own defaults, unchanged). Sizing rule for whoever does the eventual paid-tier
// upgrade: (number of backend instances) x DB_POOL_MAX must stay comfortably under Postgres's
// own max_connections, with headroom for the migration runner's separate ADMIN_DATABASE_URL
// connection and Render's own housekeeping connections -- don't just raise DB_POOL_MAX per
// instance without checking the DB plan's actual connection ceiling first.
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
});

// Backs GET /health (02-api-contract.md §0.4) -- 200 if reachable, 503 if not.
export async function checkDbConnection() {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
