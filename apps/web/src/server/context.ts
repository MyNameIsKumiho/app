import "server-only";
import { getAIEnvironment, createRouter, pickImageProvider } from "./ai";
import { getDb, type DB } from "./db/client";
import { seedBuiltins } from "./scenarios";
import { readSettings, type AppSettings } from "./settings";
import type { StoryDeps } from "./stories";

const globalForSeed = globalThis as unknown as { __aetherfallSeeded?: boolean };

/** Database with migrations applied and built-in content present. */
export function db(): DB {
  const database = getDb();
  if (!globalForSeed.__aetherfallSeeded) {
    seedBuiltins(database);
    globalForSeed.__aetherfallSeeded = true;
  }
  return database;
}

export function settings(): AppSettings {
  return readSettings(db());
}

/** Everything a story/creator call needs, built from current settings. */
export function deps(): StoryDeps {
  const database = db();
  const current = readSettings(database);
  const env = getAIEnvironment();
  return { db: database, settings: current, ai: createRouter(env, current), images: pickImageProvider(env, current) };
}
