import "server-only";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { MIGRATIONS } from "./migrations";

export type DB = BetterSQLite3Database<typeof schema>;

function open(file: string): { db: DB; sqlite: Database.Database } {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  runMigrations(sqlite);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

/** Ordered SQL migrations, tracked in `meta.schema_version`. */
export function runMigrations(sqlite: Database.Database): void {
  sqlite.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)");
  const row = sqlite.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
  let version = row ? Number(row.value) : 0;
  for (const migration of MIGRATIONS.filter((m) => m.version > version)) {
    sqlite.transaction(() => {
      sqlite.exec(migration.sql);
      sqlite.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(migration.version));
    })();
    version = migration.version;
  }
}

const globalForDb = globalThis as unknown as { __aetherfallDb?: { db: DB; sqlite: Database.Database } };

/** Process-wide connection (survives Next.js dev hot reloads). */
export function getDb(): DB {
  if (!globalForDb.__aetherfallDb) {
    const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "aetherfall.db");
    globalForDb.__aetherfallDb = open(file);
  }
  return globalForDb.__aetherfallDb.db;
}

/** For tests: an isolated in-memory database. */
export function createMemoryDb(): DB {
  return open(":memory:").db;
}
