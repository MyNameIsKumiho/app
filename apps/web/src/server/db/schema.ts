import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * SQLite schema (MVP). JSON columns hold validated domain objects; moving to
 * PostgreSQL means swapping the driver and turning them into jsonb.
 */

export const scenarios = sqliteTable(
  "scenarios",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    authorName: text("author_name").notNull(),
    /** draft | private | published */
    status: text("status").notNull().default("draft"),
    origin: text("origin").notNull().default("original"),
    version: text("version").notNull(),
    allowRemix: integer("allow_remix", { mode: "boolean" }).notNull().default(true),
    originalScenarioId: text("original_scenario_id"),
    originalAuthor: text("original_author"),
    /** Lower-cased tags joined by "|" for simple filtering. */
    tagIndex: text("tag_index").notNull().default(""),
    data: text("data", { mode: "json" }).notNull(),
    isBuiltin: integer("is_builtin", { mode: "boolean" }).notNull().default(false),
    isOwn: integer("is_own", { mode: "boolean" }).notNull().default(true),
    inLibrary: integer("in_library", { mode: "boolean" }).notNull().default(false),
    favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
    plays: integer("plays").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    publishedAt: text("published_at"),
  },
  (t) => [index("scenarios_status_idx").on(t.status)],
);

/** Immutable scenario snapshots. Stories point at a snapshot so scenario edits never break saves. */
export const scenarioSnapshots = sqliteTable("scenario_snapshots", {
  id: text("id").primaryKey(),
  scenarioId: text("scenario_id").notNull(),
  version: text("version").notNull(),
  data: text("data", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const stories = sqliteTable("stories", {
  id: text("id").primaryKey(),
  scenarioId: text("scenario_id").notNull(),
  snapshotId: text("snapshot_id").notNull(),
  scenarioVersion: text("scenario_version").notNull(),
  title: text("title").notNull(),
  characterName: text("character_name").notNull(),
  /** Current GameState (copy of the head turn's snapshot). */
  state: text("state", { mode: "json" }).notNull(),
  headTurnId: text("head_turn_id"),
  lastIllustratedTurn: integer("last_illustrated_turn").notNull().default(-10),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Event log of turns. Turns form a tree (parentId): rewinding moves the story
 * head to an earlier turn, and playing on creates a new branch. Every turn
 * keeps the full GameState after it, so any point can be restored exactly.
 */
export const turns = sqliteTable(
  "turns",
  {
    id: text("id").primaryKey(),
    storyId: text("story_id").notNull(),
    parentId: text("parent_id"),
    number: integer("number").notNull(),
    action: text("action", { mode: "json" }),
    actionSummary: text("action_summary").notNull().default(""),
    narrative: text("narrative").notNull(),
    suggestions: text("suggestions", { mode: "json" }).notNull(),
    report: text("report", { mode: "json" }),
    stateAfter: text("state_after", { mode: "json" }).notNull(),
    ai: text("ai", { mode: "json" }),
    imageId: text("image_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("turns_story_idx").on(t.storyId)],
);

export const saves = sqliteTable("saves", {
  id: text("id").primaryKey(),
  storyId: text("story_id").notNull(),
  /** auto | manual */
  kind: text("kind").notNull(),
  slot: integer("slot").notNull(),
  label: text("label").notNull(),
  turnId: text("turn_id").notNull(),
  turnNumber: integer("turn_number").notNull(),
  scenarioVersion: text("scenario_version").notNull(),
  /** Full GameState copy: player, NPC memories, summaries, timeline, flags. */
  state: text("state", { mode: "json" }).notNull(),
  aiMeta: text("ai_meta", { mode: "json" }),
  createdAt: text("created_at").notNull(),
});

export const images = sqliteTable("images", {
  id: text("id").primaryKey(),
  storyId: text("story_id"),
  scenarioId: text("scenario_id"),
  kind: text("kind").notNull(),
  prompt: text("prompt").notNull(),
  dataUri: text("data_uri").notNull(),
  provider: text("provider").notNull(),
  createdAt: text("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export const meta = sqliteTable("meta", { key: text("key"), value: text("value") }, (t) => [primaryKey({ columns: [t.key] })]);
