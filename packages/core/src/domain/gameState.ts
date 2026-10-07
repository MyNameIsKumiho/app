import { z } from "zod";
import { IdSchema, ImportanceSchema } from "./common";
import { GameTimeSchema } from "./time";
import { ItemSchema, VisualProfileSchema } from "./scenario";

/** Bumped when GameState structure changes; see scenario/migrations.ts. */
export const GAME_STATE_VERSION = 1;

const FlagValueSchema = z.union([z.boolean(), z.number(), z.string()]);

export const MemorySchema = z.object({
  id: z.string(),
  event: z.string().min(1),
  importance: ImportanceSchema,
  /** -100 (traumatic) .. 100 (joyful) */
  emotionalImpact: z.number().min(-100).max(100).default(0),
  /** Absolute in-game minutes. */
  timestamp: z.number(),
  turn: z.number().int().min(0),
  participants: z.array(z.string()).default([]),
});
export type Memory = z.infer<typeof MemorySchema>;

export const ResourcePoolSchema = z.object({ current: z.number(), max: z.number() });

export const OwnedAbilitySchema = z.object({
  abilityId: IdSchema,
  mastery: z.number().min(0).max(100),
  /** Absolute minute when the ability is ready again. */
  readyAt: z.number().default(0),
  timesUsed: z.number().int().min(0).default(0),
});
export type OwnedAbility = z.infer<typeof OwnedAbilitySchema>;

export const InventoryEntrySchema = z.object({ itemId: IdSchema, quantity: z.number().int().min(1) });
export type InventoryEntry = z.infer<typeof InventoryEntrySchema>;

export const ActiveEffectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  /** Absolute minute when the effect ends; undefined = until removed. */
  expiresAt: z.number().optional(),
  source: z.string().default(""),
});
export type ActiveEffect = z.infer<typeof ActiveEffectSchema>;

export const KnowledgeEntrySchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  source: z.enum(["start", "canon", "learned", "deduced", "system"]).default("learned"),
  turn: z.number().int().min(0).default(0),
});
export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;

export const PlayerSecretStateSchema = z.object({
  id: z.string(),
  description: z.string(),
  keywords: z.array(z.string()).default([]),
  importance: ImportanceSchema.default(70),
  knownByNpcIds: z.array(z.string()).default([]),
});
export type PlayerSecretState = z.infer<typeof PlayerSecretStateSchema>;

export const PlayerStateSchema = z.object({
  name: z.string().min(1),
  /** Character-creation answers keyed by field id (race, class, origin...). */
  fields: z.record(z.string(), z.string()).default({}),
  visualProfile: VisualProfileSchema.prefault({}),
  alive: z.boolean().default(true),
  locationId: z.string(),
  stats: z.record(z.string(), z.number()).default({}),
  resources: z.record(z.string(), ResourcePoolSchema).default({}),
  abilities: z.array(OwnedAbilitySchema).default([]),
  inventory: z.array(InventoryEntrySchema).default([]),
  equipment: z.record(z.string(), z.string()).default({}),
  currency: z.record(z.string(), z.number()).default({}),
  activeEffects: z.array(ActiveEffectSchema).default([]),
  /** PLAYER knowledge: things the protagonist knows. Never automatically shared with NPCs. */
  knowledge: z.array(KnowledgeEntrySchema).default([]),
  secrets: z.array(PlayerSecretStateSchema).default([]),
  level: z.number().int().min(1).default(1),
  xp: z.number().int().min(0).default(0),
  skillPoints: z.number().int().min(0).default(0),
  attributePoints: z.number().int().min(0).default(0),
  titles: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
  classId: z.string().optional(),
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;

export const NPCStateSchema = z.object({
  id: z.string(),
  alive: z.boolean().default(true),
  locationId: z.string().optional(),
  mood: z.string().default("спокойствие"),
  met: z.boolean().default(false),
  /** Numeric relationship toward the player per axis id. */
  relationship: z.record(z.string(), z.number()).default({}),
  /** NPC knowledge: facts this NPC actually learned. */
  knowledge: z.array(z.string()).default([]),
  /** Player secrets this NPC has learned. */
  knownSecretIds: z.array(z.string()).default([]),
  memories: z.array(MemorySchema).default([]),
  notes: z.string().default(""),
});
export type NPCState = z.infer<typeof NPCStateSchema>;

export const QuestStateSchema = z.object({
  status: z.enum(["inactive", "active", "completed", "failed"]),
  objectives: z.record(z.string(), z.boolean()).default({}),
  notes: z.array(z.string()).default([]),
  startedAtTurn: z.number().int().optional(),
});
export type QuestState = z.infer<typeof QuestStateSchema>;

export const TimelineEventStateSchema = z.object({
  status: z.enum(["pending", "occurred", "modified", "cancelled"]),
  note: z.string().default(""),
  resolvedAt: z.number().optional(),
});
export type TimelineEventState = z.infer<typeof TimelineEventStateSchema>;

export const DivergenceSchema = z.object({
  id: z.string(),
  turn: z.number().int(),
  eventId: z.string().optional(),
  description: z.string(),
  importance: ImportanceSchema.default(60),
});
export type Divergence = z.infer<typeof DivergenceSchema>;

export const WorldFactSchema = z.object({
  id: z.string(),
  text: z.string(),
  importance: ImportanceSchema,
  turn: z.number().int(),
  timestamp: z.number(),
});
export type WorldFact = z.infer<typeof WorldFactSchema>;

export const LogEntrySchema = z.object({
  turn: z.number().int(),
  action: z.string(),
  narrative: z.string(),
  locationId: z.string(),
  timestamp: z.number(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const SummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  fromTurn: z.number().int(),
  toTurn: z.number().int(),
});
export type Summary = z.infer<typeof SummarySchema>;

export const SceneSchema = z.object({
  title: z.string(),
  locationId: z.string(),
  startedAtTurn: z.number().int(),
  presentNpcIds: z.array(z.string()).default([]),
});
export type Scene = z.infer<typeof SceneSchema>;

/** Layered story memory. Each level is cheaper but less detailed than the previous one. */
export const StoryMemorySchema = z.object({
  currentScene: SceneSchema,
  /** Raw recent turns (Recent Context). */
  recent: z.array(LogEntrySchema).default([]),
  sceneSummaries: z.array(SummarySchema).default([]),
  arcSummaries: z.array(SummarySchema).default([]),
  currentArc: z.object({ title: z.string(), startedAtTurn: z.number().int() }),
  /** Long-term memory: important story events with importance scores. */
  longTerm: z.array(MemorySchema).default([]),
});
export type StoryMemory = z.infer<typeof StoryMemorySchema>;

export const JournalEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(["event", "person", "location", "secret", "quest", "system"]),
  text: z.string(),
  turn: z.number().int(),
  timestamp: z.number(),
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const JournalSchema = z.object({
  entries: z.array(JournalEntrySchema).default([]),
  notes: z.array(z.object({ id: z.string(), text: z.string(), createdAt: z.string() })).default([]),
});

export const GameStateSchema = z.object({
  stateVersion: z.number().int().default(GAME_STATE_VERSION),
  scenarioId: z.string(),
  scenarioVersion: z.string(),
  turn: z.number().int().min(0),
  time: GameTimeSchema,
  /** Absolute minutes; kept alongside `time` for cheap comparisons. */
  clock: z.number(),
  startedAtClock: z.number(),
  player: PlayerStateSchema,
  npcs: z.record(z.string(), NPCStateSchema).default({}),
  locations: z.record(z.string(), z.object({ discovered: z.boolean(), visited: z.boolean(), notes: z.array(z.string()).default([]) })).default({}),
  quests: z.record(z.string(), QuestStateSchema).default({}),
  factions: z.record(z.string(), z.object({ reputation: z.number() })).default({}),
  flags: z.record(z.string(), FlagValueSchema).default({}),
  worldFacts: z.array(WorldFactSchema).default([]),
  timeline: z.record(z.string(), TimelineEventStateSchema).default({}),
  divergences: z.array(DivergenceSchema).default([]),
  memory: StoryMemorySchema,
  journal: JournalSchema.prefault({}),
  /** Improvised items that appeared during play. They never carry mechanical effects. */
  customItems: z.array(ItemSchema).default([]),
  /** Monotonic counter for generated ids, keeps ids deterministic (good for tests and replays). */
  seq: z.number().int().min(0).default(0),
});
export type GameState = z.infer<typeof GameStateSchema>;

export function nextId(state: GameState, prefix: string): string {
  state.seq += 1;
  return `${prefix}-${state.seq}`;
}
