/**
 * Database client for the demo app.
 *
 * When DATABASE_URL is set, connects to a real Postgres instance via
 * @thebookingkit/db. Otherwise returns null, and the demo falls back
 * to in-memory mock data.
 */
import { createDb, type Database } from "@thebookingkit/db";

let _db: Database | null = null;
let _initialized = false;

export function getDb(): Database | null {
  if (_initialized) return _db;
  _initialized = true;

  const url = process.env.DATABASE_URL;
  if (!url) return null;

  _db = createDb(url, { max: 5 });
  return _db;
}

/** Whether a real database connection is available */
export function hasDb(): boolean {
  return getDb() !== null;
}

export type { Database };
