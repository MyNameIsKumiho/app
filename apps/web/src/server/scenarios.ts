import { createHash, randomUUID } from "node:crypto";
import { desc, eq, or } from "drizzle-orm";
import {
  APP_VERSION,
  ScenarioSchema,
  bumpVersion,
  createAetherfallAcademy,
  exportScenario,
  readScenarioPackage,
  remixScenario,
  slugify,
  validateScenario,
  type Scenario,
} from "@aetherfall/core/server";
import type { ScenarioCard, ScenarioDetail } from "@/lib/types";
import type { DB } from "./db/client";
import { scenarioSnapshots, scenarios } from "./db/schema";
import { ApiError } from "./http";

type ScenarioRow = typeof scenarios.$inferSelect;
export type ScenarioScope = "explore" | "library" | "mine" | "favorites";

const now = () => new Date().toISOString();

export function newScenarioId(title: string): string {
  return `${slugify(title, "scenario").slice(0, 40)}-${randomUUID().slice(0, 8)}`;
}

function allTags(s: Scenario): string[] {
  const t = s.tags;
  return [...new Set([...t.genre, ...t.setting, ...t.tone, ...t.themes, ...t.features, ...t.content])];
}

function rowValues(scenario: Scenario) {
  return {
    title: scenario.metadata.title,
    authorName: scenario.metadata.authorName,
    origin: scenario.metadata.origin,
    version: scenario.version,
    allowRemix: scenario.metadata.allowRemix,
    originalScenarioId: scenario.metadata.originalScenarioId ?? null,
    originalAuthor: scenario.metadata.originalAuthor ?? null,
    tagIndex: allTags(scenario).map((t) => t.toLowerCase()).join("|"),
    data: scenario,
  };
}

function toCard(row: ScenarioRow, titles?: Map<string, string>): ScenarioCard {
  const s = ScenarioSchema.parse(row.data);
  return {
    id: row.id,
    title: row.title,
    shortDescription: s.metadata.shortDescription,
    authorName: row.authorName,
    version: row.version,
    status: row.status as ScenarioCard["status"],
    origin: s.metadata.origin,
    fandom: s.metadata.fandom,
    tags: allTags(s),
    coverImage: s.metadata.coverImage ?? null,
    isBuiltin: row.isBuiltin,
    isOwn: row.isOwn,
    inLibrary: row.inLibrary,
    favorite: row.favorite,
    plays: row.plays,
    allowRemix: row.allowRemix,
    basedOn: row.originalScenarioId ? { id: row.originalScenarioId, author: row.originalAuthor ?? "", title: titles?.get(row.originalScenarioId) ?? null } : null,
    updatedAt: row.updatedAt,
  };
}

function getRow(db: DB, id: string): ScenarioRow {
  const row = db.select().from(scenarios).where(eq(scenarios.id, id)).get();
  if (!row) throw new ApiError(404, "Сценарий не найден");
  return row;
}

export function loadScenario(db: DB, id: string): Scenario {
  return ScenarioSchema.parse(getRow(db, id).data);
}

/** Inserts or refreshes the built-in demo scenario. */
export function seedBuiltins(db: DB): void {
  const demo = createAetherfallAcademy();
  const existing = db.select().from(scenarios).where(eq(scenarios.id, demo.id)).get();
  const time = now();
  if (!existing) {
    db.insert(scenarios)
      .values({ id: demo.id, ...rowValues(demo), status: "published", isBuiltin: true, isOwn: false, inLibrary: true, createdAt: time, updatedAt: time, publishedAt: time })
      .run();
  } else if (existing.isBuiltin && existing.version !== demo.version) {
    db.update(scenarios).set({ ...rowValues(demo), updatedAt: time }).where(eq(scenarios.id, demo.id)).run();
  }
}

export function listScenarios(db: DB, input: { scope: ScenarioScope; q?: string; tag?: string }): ScenarioCard[] {
  const where =
    input.scope === "explore"
      ? or(eq(scenarios.status, "published"), eq(scenarios.isBuiltin, true))
      : input.scope === "mine"
        ? eq(scenarios.isOwn, true)
        : input.scope === "favorites"
          ? eq(scenarios.favorite, true)
          : or(eq(scenarios.inLibrary, true), eq(scenarios.isOwn, true));
  const rows = db.select().from(scenarios).where(where).orderBy(desc(scenarios.updatedAt)).all();
  const titles = new Map(db.select({ id: scenarios.id, title: scenarios.title }).from(scenarios).all().map((r) => [r.id, r.title]));
  const q = input.q?.trim().toLowerCase();
  const tag = input.tag?.trim().toLowerCase();
  return rows
    .filter((r) => !tag || r.tagIndex.split("|").includes(tag))
    .map((r) => toCard(r, titles))
    .filter((c) => !q || `${c.title} ${c.shortDescription} ${c.authorName} ${c.fandom} ${c.tags.join(" ")}`.toLowerCase().includes(q));
}

export function getScenarioDetail(db: DB, id: string): ScenarioDetail {
  const row = getRow(db, id);
  const titles = new Map(db.select({ id: scenarios.id, title: scenarios.title }).from(scenarios).all().map((r) => [r.id, r.title]));
  const scenario = ScenarioSchema.parse(row.data);
  return { card: toCard(row, titles), scenario, validation: validateScenario(scenario) };
}

/** Starter content so a blank scenario is technically playable right away. */
export function blankScenario(id: string, title: string, authorName: string): Scenario {
  return ScenarioSchema.parse({
    id,
    metadata: { title, authorName, shortDescription: "" },
    locations: [{ id: "start", name: "Начальная локация", description: "Опишите место, где начинается история." }],
    mechanics: {
      stats: [
        { id: "health", name: "Здоровье", kind: "resource", default: 100, max: 100 },
        { id: "energy", name: "Энергия", kind: "resource", default: 50, max: 50 },
      ],
    },
    start: { date: { year: 1, month: 1, day: 1, hour: 9, minute: 0 }, locationId: "start", situation: "", openingScene: "" },
  });
}

export function createScenario(db: DB, input: { data?: unknown; title?: string; authorName: string }): ScenarioCard {
  const title = input.title?.trim() || "Новый сценарий";
  const id = newScenarioId(title);
  const scenario = input.data ? ScenarioSchema.parse({ ...(input.data as object), id }) : blankScenario(id, title, input.authorName);
  const time = now();
  db.insert(scenarios).values({ id, ...rowValues(scenario), status: "draft", isOwn: true, inLibrary: true, createdAt: time, updatedAt: time }).run();
  return toCard(getRow(db, id));
}

function requireOwn(row: ScenarioRow): void {
  if (!row.isOwn || row.isBuiltin) throw new ApiError(403, "Этот сценарий нельзя редактировать. Сделайте ремикс, чтобы изменить свою копию.");
}

export function updateScenario(db: DB, id: string, data: unknown): ScenarioDetail {
  const row = getRow(db, id);
  requireOwn(row);
  const scenario = ScenarioSchema.parse({ ...(data as object), id, version: row.version });
  db.update(scenarios).set({ ...rowValues(scenario), updatedAt: now() }).where(eq(scenarios.id, id)).run();
  return getScenarioDetail(db, id);
}

/**
 * Publishing validates first. Re-publishing bumps the version so existing
 * saves keep pointing at the snapshot they were started with.
 */
export function publishScenario(db: DB, id: string, input: { visibility: "published" | "private"; bump?: "patch" | "minor" | "major" }): ScenarioDetail {
  const row = getRow(db, id);
  requireOwn(row);
  const scenario = ScenarioSchema.parse(row.data);
  const report = validateScenario(scenario);
  if (!report.canPublish) throw new ApiError(422, "Сценарий содержит ошибки, которые мешают публикации", report);
  const wasReleased = row.status !== "draft";
  scenario.version = wasReleased ? bumpVersion(scenario.version, input.bump ?? "minor") : scenario.version;
  scenario.metadata.requiredAppVersion = APP_VERSION;
  const time = now();
  db.update(scenarios)
    .set({ ...rowValues(scenario), status: input.visibility, updatedAt: time, publishedAt: input.visibility === "published" ? time : row.publishedAt })
    .where(eq(scenarios.id, id))
    .run();
  return getScenarioDetail(db, id);
}

export function remix(db: DB, id: string, input: { authorName: string; title?: string }): ScenarioCard {
  const original = loadScenario(db, id);
  if (!original.metadata.allowRemix) throw new ApiError(403, "Автор запретил ремиксы этого сценария");
  const newId = newScenarioId(input.title || original.metadata.title);
  const copy = remixScenario(original, { newId, title: input.title, authorName: input.authorName });
  const time = now();
  db.insert(scenarios).values({ id: newId, ...rowValues(copy), status: "draft", isOwn: true, inLibrary: true, createdAt: time, updatedAt: time }).run();
  return toCard(getRow(db, newId));
}

export function setLibraryFlags(db: DB, id: string, input: { inLibrary?: boolean; favorite?: boolean }): ScenarioCard {
  getRow(db, id);
  const set: Partial<ScenarioRow> = {};
  if (input.inLibrary !== undefined) set.inLibrary = input.inLibrary;
  if (input.favorite !== undefined) {
    set.favorite = input.favorite;
    if (input.favorite) set.inLibrary = true;
  }
  if (Object.keys(set).length > 0) db.update(scenarios).set(set).where(eq(scenarios.id, id)).run();
  return toCard(getRow(db, id));
}

export function deleteScenario(db: DB, id: string): void {
  const row = getRow(db, id);
  if (row.isBuiltin) throw new ApiError(403, "Встроенный сценарий нельзя удалить");
  if (!row.isOwn) {
    db.update(scenarios).set({ inLibrary: false, favorite: false }).where(eq(scenarios.id, id)).run();
    return;
  }
  // Stories keep working: they reference immutable snapshots, not this row.
  db.delete(scenarios).where(eq(scenarios.id, id)).run();
}

export function exportScenarioFile(db: DB, id: string): { filename: string; content: string } {
  const scenario = loadScenario(db, id);
  return { filename: `${slugify(scenario.metadata.title, scenario.id)}.scenario`, content: exportScenario(scenario) };
}

/** Imports a `.scenario` file. An id that already exists gets a fresh id instead of overwriting. */
export function importScenarioFile(db: DB, text: string, profileName: string): ScenarioCard {
  const raw = readScenarioPackage(text);
  const parsed = ScenarioSchema.parse(raw);
  const exists = db.select({ id: scenarios.id }).from(scenarios).where(eq(scenarios.id, parsed.id)).get();
  const id = exists ? newScenarioId(parsed.metadata.title) : parsed.id;
  const scenario = { ...parsed, id };
  const time = now();
  const own = scenario.metadata.authorName === profileName;
  db.insert(scenarios).values({ id, ...rowValues(scenario), status: "private", isOwn: own, inLibrary: true, createdAt: time, updatedAt: time }).run();
  return toCard(getRow(db, id));
}

export function incrementPlays(db: DB, id: string): void {
  const row = db.select({ plays: scenarios.plays }).from(scenarios).where(eq(scenarios.id, id)).get();
  if (row) db.update(scenarios).set({ plays: row.plays + 1 }).where(eq(scenarios.id, id)).run();
}

/** Returns (creating if needed) the immutable snapshot for the scenario's exact content. */
export function ensureSnapshot(db: DB, scenario: Scenario): string {
  const digest = createHash("sha256").update(JSON.stringify(scenario)).digest("hex").slice(0, 16);
  const id = `${scenario.id}@${scenario.version}#${digest}`;
  const existing = db.select({ id: scenarioSnapshots.id }).from(scenarioSnapshots).where(eq(scenarioSnapshots.id, id)).get();
  if (!existing) db.insert(scenarioSnapshots).values({ id, scenarioId: scenario.id, version: scenario.version, data: scenario, createdAt: now() }).run();
  return id;
}

export function loadSnapshot(db: DB, snapshotId: string): Scenario {
  const row = db.select().from(scenarioSnapshots).where(eq(scenarioSnapshots.id, snapshotId)).get();
  if (!row) throw new ApiError(500, "Снимок сценария для этой истории потерян");
  return ScenarioSchema.parse(row.data);
}

export function latestVersion(db: DB, scenarioId: string): string | null {
  return db.select({ version: scenarios.version }).from(scenarios).where(eq(scenarios.id, scenarioId)).get()?.version ?? null;
}
