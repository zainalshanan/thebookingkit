import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

/**
 * Create a database client connected to the given Postgres URL.
 * Uses postgres.js as the driver with Drizzle ORM.
 *
 * @param databaseUrl - Postgres connection string
 * @param options.max - Maximum number of connections in the pool (default: 10)
 * @param options.ssl - SSL configuration; defaults to `false` for localhost, `'require'` otherwise
 */
export function createDb(databaseUrl: string, options?: { max?: number; ssl?: boolean | object }) {
  const client = postgres(databaseUrl, {
    ssl: options?.ssl ?? (databaseUrl.includes("localhost") ? false : "require"),
    max: options?.max ?? 10,
  });
  return drizzle(client, { schema });
}

/** Database instance type */
export type Database = ReturnType<typeof createDb>;
