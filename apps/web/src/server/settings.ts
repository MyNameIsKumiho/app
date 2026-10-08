import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "./db/client";
import { settings } from "./db/schema";

/**
 * User-facing settings. API keys are NOT here: they live only in the server
 * environment (later: the OS keychain in the desktop build) and never reach
 * the browser or the database.
 */
export const AppSettingsSchema = z.object({
  ai: z
    .object({
      /** Provider id ("claude", "openai", "chatgpt", "mock") or "auto". */
      primary: z.string().default("auto"),
      /** Provider id or "disabled". */
      fallback: z.string().default("disabled"),
      temperature: z.number().min(0).max(1).default(0.8),
      contextBudget: z.number().int().min(2000).max(60000).default(8000),
      /** Fast but simpler, balanced, or slower but smarter. */
      speed: z.enum(["fast", "balanced", "smart"]).default("balanced"),
      /** Exact model per provider id; empty means "use the speed preset". Model names only, never keys. */
      models: z
        .object({ claude: z.string().trim().max(100).default(""), chatgpt: z.string().trim().max(100).default(""), openai: z.string().trim().max(100).default("") })
        .prefault({}),
      /** Show provider/model and engine reports under each turn. */
      showDebug: z.boolean().default(false),
    })
    .prefault({}),
  images: z
    .object({
      mode: z.enum(["never", "manual", "important", "frequent"]).default("manual"),
      provider: z.enum(["auto", "openai", "mock"]).default("auto"),
    })
    .prefault({}),
  gameplay: z
    .object({
      autosave: z.boolean().default(true),
      autosaveSlots: z.number().int().min(1).max(20).default(5),
      showSuggestions: z.boolean().default(true),
    })
    .prefault({}),
  profile: z.object({ authorName: z.string().trim().min(1).max(80).default("Игрок") }).prefault({}),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

const KEY = "app";

export function readSettings(db: DB): AppSettings {
  const row = db.select().from(settings).where(eq(settings.key, KEY)).get();
  const parsed = AppSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : AppSettingsSchema.parse({});
}

/** Deep-merges a partial update, validates it and stores it. */
export function writeSettings(db: DB, patch: unknown): AppSettings {
  const current = readSettings(db);
  const incoming = z.record(z.string(), z.unknown()).parse(patch);
  const merged: Record<string, unknown> = { ...current };
  for (const [section, value] of Object.entries(incoming)) {
    const base = (current as Record<string, unknown>)[section];
    merged[section] = value && typeof value === "object" && base && typeof base === "object" ? { ...base, ...value } : value;
  }
  const next = AppSettingsSchema.parse(merged);
  db.insert(settings).values({ key: KEY, value: next }).onConflictDoUpdate({ target: settings.key, set: { value: next } }).run();
  return next;
}
