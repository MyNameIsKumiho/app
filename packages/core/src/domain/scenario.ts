import { z } from "zod";
import { IdSchema, ImportanceSchema } from "./common";
import { CalendarSchema, GameTimeSchema, TimelineDateSchema } from "./time";

/** Bumped when the on-disk Scenario structure changes; see scenario/migrations.ts. */
export const SCENARIO_FORMAT_VERSION = 1;
export const APP_VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

export const ConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("flag"), key: z.string().min(1), equals: z.union([z.boolean(), z.number(), z.string()]) }),
  z.object({ type: z.literal("npc_alive"), npcId: IdSchema, alive: z.boolean().default(true) }),
  z.object({
    type: z.literal("quest_status"),
    questId: IdSchema,
    status: z.enum(["inactive", "active", "completed", "failed"]),
  }),
  z.object({ type: z.literal("player_at"), locationId: IdSchema }),
  z.object({ type: z.literal("relationship_at_least"), npcId: IdSchema, axis: IdSchema, value: z.number() }),
]);
export type Condition = z.infer<typeof ConditionSchema>;

/** Deterministic mechanical effect, applied by the engine (never by the AI). */
export const EffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("resource"), resourceId: IdSchema, amount: z.number() }),
  z.object({ type: z.literal("stat"), statId: IdSchema, amount: z.number() }),
  z.object({
    type: z.literal("status"),
    name: z.string().min(1),
    description: z.string().default(""),
    durationMinutes: z.number().int().min(1).max(60 * 24 * 30),
  }),
  z.object({ type: z.literal("flag"), key: z.string().min(1), value: z.union([z.boolean(), z.number(), z.string()]) }),
]);
export type Effect = z.infer<typeof EffectSchema>;

export const VisualProfileSchema = z.object({
  hair: z.string().default(""),
  eyes: z.string().default(""),
  face: z.string().default(""),
  body: z.string().default(""),
  height: z.string().default(""),
  clothing: z.string().default(""),
  accessories: z.string().default(""),
  distinctiveFeatures: z.string().default(""),
  referenceImages: z.array(z.string()).default([]),
});
export type VisualProfile = z.infer<typeof VisualProfileSchema>;

// ---------------------------------------------------------------------------
// Abilities, items, stats
// ---------------------------------------------------------------------------

export const AbilityCategorySchema = z.object({ id: IdSchema, label: z.string().min(1) });
export type AbilityCategory = z.infer<typeof AbilityCategorySchema>;

export const DEFAULT_ABILITY_CATEGORIES: AbilityCategory[] = [
  { id: "attack", label: "Атака" },
  { id: "defense", label: "Защита" },
  { id: "control", label: "Контроль" },
  { id: "support", label: "Поддержка" },
  { id: "healing", label: "Лечение" },
  { id: "movement", label: "Передвижение" },
  { id: "utility", label: "Бытовые" },
  { id: "passive", label: "Пассивные" },
  { id: "forbidden", label: "Запрещённые" },
  { id: "special", label: "Особые" },
];

export const AbilityRequirementsSchema = z.object({
  minLevel: z.number().int().min(0).optional(),
  stats: z.record(z.string(), z.number()).default({}),
  abilityIds: z.array(IdSchema).default([]),
  itemIds: z.array(IdSchema).default([]),
  flags: z.array(z.string()).default([]),
});

/** Universal ability: spells, techniques, superpowers, skills, psionics... */
export const AbilitySchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().default(""),
  category: IdSchema.default("special"),
  subcategory: z.string().default(""),
  /** 1 (trivial) .. 10 (legendary) */
  difficulty: z.number().int().min(1).max(10).default(3),
  /** Starting mastery 0..100 when granted. */
  mastery: z.number().int().min(0).max(100).default(10),
  energyCost: z.number().min(0).default(0),
  /** In-game minutes before it can be used again. */
  cooldown: z.number().int().min(0).default(0),
  requirements: AbilityRequirementsSchema.prefault({}),
  effects: z.array(EffectSchema).default([]),
  tags: z.array(z.string()).default([]),
  hidden: z.boolean().default(false),
  passive: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type Ability = z.infer<typeof AbilitySchema>;

export const ItemSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().default(""),
  type: z.enum(["consumable", "equipment", "key", "material", "misc"]).default("misc"),
  /** Equipment slot id for type=equipment (e.g. "weapon", "body", "accessory"). */
  slot: z.string().optional(),
  effects: z.array(EffectSchema).default([]),
  value: z.number().min(0).default(0),
  stackable: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  hidden: z.boolean().default(false),
  visualDescription: z.string().default(""),
});
export type Item = z.infer<typeof ItemSchema>;

export const StatDefinitionSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().default(""),
  /** attribute = single number; resource = current/max pool (health, mana...) */
  kind: z.enum(["attribute", "resource"]).default("attribute"),
  min: z.number().default(0),
  max: z.number().default(100),
  default: z.number().default(10),
});
export type StatDefinition = z.infer<typeof StatDefinitionSchema>;

// ---------------------------------------------------------------------------
// World content
// ---------------------------------------------------------------------------

export const LocationSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().default(""),
  region: z.string().default(""),
  connections: z.array(z.object({ locationId: IdSchema, travelMinutes: z.number().int().min(0).default(10) })).default([]),
  tags: z.array(z.string()).default([]),
  hidden: z.boolean().default(false),
  visualDescription: z.string().default(""),
});
export type Location = z.infer<typeof LocationSchema>;

export const SecretSchema = z.object({
  id: IdSchema,
  description: z.string().min(1),
  /** Words that, if spoken by an NPC who does not know the secret, indicate a leak. */
  keywords: z.array(z.string()).default([]),
  knownByNpcIds: z.array(IdSchema).default([]),
  importance: ImportanceSchema.default(70),
});
export type Secret = z.infer<typeof SecretSchema>;

export const NPCSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().default(""),
  appearance: z.string().default(""),
  personality: z.string().default(""),
  speechStyle: z.string().default(""),
  goals: z.array(z.string()).default([]),
  fears: z.array(z.string()).default([]),
  secrets: z.array(SecretSchema).default([]),
  abilityIds: z.array(IdSchema).default([]),
  relationships: z.array(z.object({ targetId: IdSchema, description: z.string() })).default([]),
  factionIds: z.array(IdSchema).default([]),
  startingLocationId: IdSchema.optional(),
  /** Facts this NPC knows at the start (plain sentences). */
  knowledge: z.array(z.string()).default([]),
  startingMood: z.string().default("спокойствие"),
  /** Starting relationship toward the player, per axis id. */
  startingRelationship: z.record(z.string(), z.number()).default({}),
  importance: z.enum(["major", "minor"]).default("major"),
  aiInstructions: z.string().default(""),
  visualProfile: VisualProfileSchema.prefault({}),
});
export type NPC = z.infer<typeof NPCSchema>;

export const FactionSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().default(""),
  leaderId: IdSchema.optional(),
  memberIds: z.array(IdSchema).default([]),
  goals: z.array(z.string()).default([]),
  enemyIds: z.array(IdSchema).default([]),
  allyIds: z.array(IdSchema).default([]),
  territory: z.string().default(""),
  startingReputation: z.number().min(-100).max(100).default(0),
});
export type Faction = z.infer<typeof FactionSchema>;

export const LORE_TYPES = [
  "character", "location", "faction", "item", "ability", "race", "creature",
  "historical_event", "concept", "religion", "technology", "magic", "custom",
] as const;

export const LoreEntrySchema = z.object({
  id: IdSchema,
  type: z.enum(LORE_TYPES).default("concept"),
  name: z.string().min(1),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  /** public: everyone knows; hidden: exists but not common knowledge; secret: only via discovery. */
  visibility: z.enum(["public", "hidden", "secret"]).default("public"),
  aiInstructions: z.string().default(""),
  relatedIds: z.array(IdSchema).default([]),
});
export type LoreEntry = z.infer<typeof LoreEntrySchema>;

export const QuestSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  description: z.string().default(""),
  objectives: z.array(z.object({ id: IdSchema, description: z.string().min(1), optional: z.boolean().default(false) })).default([]),
  giverNpcId: IdSchema.optional(),
  rewards: z
    .object({
      xp: z.number().int().min(0).default(0),
      items: z.array(z.object({ itemId: IdSchema, quantity: z.number().int().min(1).default(1) })).default([]),
      currency: z.record(z.string(), z.number()).default({}),
    })
    .prefault({}),
  hidden: z.boolean().default(false),
  daily: z.boolean().default(false),
});
export type Quest = z.infer<typeof QuestSchema>;

export const TimelineEventSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  date: TimelineDateSchema,
  conditions: z.array(ConditionSchema).default([]),
  participants: z.array(IdSchema).default([]),
  locationId: IdSchema.optional(),
  description: z.string().default(""),
  importance: ImportanceSchema.default(50),
  /** Mutable events may be altered or cancelled by player actions. Fixed events only fail when impossible. */
  mutable: z.boolean().default(true),
  hidden: z.boolean().default(false),
  /** Consequences applied when the event actually happens. */
  effects: z.array(EffectSchema).default([]),
  /** World fact recorded when the event happens. */
  outcome: z.string().default(""),
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

// ---------------------------------------------------------------------------
// Relationships, system, rules
// ---------------------------------------------------------------------------

export const RelationshipAxisSchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  min: z.number().default(-100),
  max: z.number().default(100),
  default: z.number().default(0),
  /** Human-readable bands, evaluated from the highest `min` down. */
  levels: z.array(z.object({ min: z.number(), label: z.string() })).default([]),
  hiddenFromPlayer: z.boolean().default(false),
});
export type RelationshipAxis = z.infer<typeof RelationshipAxisSchema>;

const bands = (labels: [string, string, string, string, string]) => [
  { min: -100, label: labels[0] },
  { min: -40, label: labels[1] },
  { min: -10, label: labels[2] },
  { min: 20, label: labels[3] },
  { min: 60, label: labels[4] },
];

export const DEFAULT_RELATIONSHIP_AXES: RelationshipAxis[] = [
  { id: "trust", label: "Доверие", min: -100, max: 100, default: 0, hiddenFromPlayer: false, levels: bands(["Нет доверия", "Низкое", "Нейтральное", "Высокое", "Абсолютное"]) },
  { id: "friendship", label: "Отношение", min: -100, max: 100, default: 0, hiddenFromPlayer: false, levels: bands(["Враждебное", "Холодное", "Нейтральное", "Дружелюбное", "Близкое"]) },
  { id: "respect", label: "Уважение", min: -100, max: 100, default: 0, hiddenFromPlayer: false, levels: bands(["Презрение", "Пренебрежение", "Нейтральное", "Уважение", "Восхищение"]) },
  { id: "fear", label: "Страх", min: 0, max: 100, default: 0, hiddenFromPlayer: false, levels: [{ min: 0, label: "Нет" }, { min: 20, label: "Опасается" }, { min: 60, label: "Боится" }] },
  { id: "suspicion", label: "Подозрение", min: 0, max: 100, default: 10, hiddenFromPlayer: false, levels: [{ min: 0, label: "Низкое" }, { min: 35, label: "Среднее" }, { min: 70, label: "Высокое" }] },
  { id: "affection", label: "Симпатия", min: -100, max: 100, default: 0, hiddenFromPlayer: true, levels: bands(["Отвращение", "Неприязнь", "Нейтральная", "Симпатия", "Сильная симпатия"]) },
  { id: "hostility", label: "Враждебность", min: 0, max: 100, default: 0, hiddenFromPlayer: false, levels: [{ min: 0, label: "Нет" }, { min: 30, label: "Скрытая" }, { min: 65, label: "Открытая" }] },
  { id: "romantic_interest", label: "Романтический интерес", min: 0, max: 100, default: 0, hiddenFromPlayer: true, levels: [{ min: 0, label: "Нет" }, { min: 30, label: "Есть" }, { min: 70, label: "Сильный" }] },
];

export const SystemModulesSchema = z.object({
  levels: z.boolean().default(true),
  experience: z.boolean().default(true),
  skillPoints: z.boolean().default(false),
  attributePoints: z.boolean().default(false),
  quests: z.boolean().default(true),
  achievements: z.boolean().default(false),
  shop: z.boolean().default(false),
  classes: z.boolean().default(false),
  titles: z.boolean().default(false),
  perks: z.boolean().default(false),
  dailyQuests: z.boolean().default(false),
});

export const GameSystemSchema = z.object({
  enabled: z.boolean().default(false),
  name: z.string().default("Система"),
  description: z.string().default(""),
  /** How the System talks to the player (tone, format of notifications). */
  voice: z.string().default("Короткие уведомления в квадратных скобках."),
  modules: SystemModulesSchema.prefault({}),
  xpCurve: z.object({ base: z.number().min(1).default(100), growth: z.number().min(1).default(1.5) }).prefault({}),
  maxLevel: z.number().int().min(1).default(100),
  skillPointsPerLevel: z.number().int().min(0).default(1),
  attributePointsPerLevel: z.number().int().min(0).default(0),
  currencies: z.array(z.object({ id: IdSchema, name: z.string().min(1) })).default([]),
  shop: z.array(z.object({ itemId: IdSchema, price: z.number().min(0), currencyId: IdSchema })).default([]),
  achievements: z.array(z.object({ id: IdSchema, name: z.string(), description: z.string().default(""), hidden: z.boolean().default(false) })).default([]),
  titles: z.array(z.object({ id: IdSchema, name: z.string(), description: z.string().default("") })).default([]),
  classes: z.array(z.object({ id: IdSchema, name: z.string(), description: z.string().default("") })).default([]),
  customMechanics: z.array(z.object({ id: IdSchema, name: z.string(), rules: z.string() })).default([]),
});
export type GameSystem = z.infer<typeof GameSystemSchema>;

const Level4 = z.enum(["none", "low", "medium", "high"]);
export type Level4 = z.infer<typeof Level4>;

/**
 * Human-facing storyteller settings. The author answers questions in plain
 * language; scenario/rulesCompiler.ts converts them into AI instructions.
 */
export const AIRulesSchema = z.object({
  tone: z.string().default("Приключенческий"),
  narrativeStyle: z.string().default("Живая художественная проза в духе ранобэ"),
  responseLength: z.enum(["short", "medium", "long"]).default("medium"),
  pov: z.enum(["second", "first", "third"]).default("second"),
  violence: Level4.default("medium"),
  romance: Level4.default("low"),
  comedy: Level4.default("low"),
  difficulty: z.enum(["story", "normal", "hard", "brutal"]).default("normal"),
  canonStrictness: z.enum(["loose", "balanced", "strict"]).default("balanced"),
  playerFreedom: z.enum(["guided", "open", "sandbox"]).default("open"),
  npcAutonomy: Level4.default("medium"),
  worldLethality: Level4.default("medium"),
  playerCanDie: z.boolean().default(false),
  progressionSpeed: z.enum(["slow", "normal", "fast"]).default("normal"),
  worldReactivity: z.enum(["static", "reactive", "living"]).default("reactive"),
  customInstructions: z.string().default(""),
});
export type AIRules = z.infer<typeof AIRulesSchema>;

// ---------------------------------------------------------------------------
// Character creation and start
// ---------------------------------------------------------------------------

export const GrantSchema = z.object({
  abilityIds: z.array(IdSchema).default([]),
  items: z.array(z.object({ itemId: IdSchema, quantity: z.number().int().min(1).default(1) })).default([]),
  stats: z.record(z.string(), z.number()).default({}),
});

export const CharacterFieldSchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  type: z.enum(["text", "textarea", "select", "number"]).default("text"),
  required: z.boolean().default(false),
  placeholder: z.string().default(""),
  /** Hint for the AI when generating a character. */
  aiHint: z.string().default(""),
  options: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1), description: z.string().default(""), grants: GrantSchema.prefault({}) }))
    .default([]),
});
export type CharacterField = z.infer<typeof CharacterFieldSchema>;

export const BASE_CHARACTER_FIELDS: CharacterField[] = [
  { id: "name", label: "Имя", type: "text", required: true, placeholder: "Как зовут героя?", aiHint: "", options: [] },
  { id: "gender", label: "Пол", type: "text", required: false, placeholder: "", aiHint: "", options: [] },
  { id: "age", label: "Возраст", type: "number", required: false, placeholder: "17", aiHint: "", options: [] },
  { id: "appearance", label: "Внешность", type: "textarea", required: false, placeholder: "", aiHint: "", options: [] },
  { id: "personality", label: "Характер", type: "textarea", required: false, placeholder: "", aiHint: "", options: [] },
  { id: "background", label: "Прошлое", type: "textarea", required: false, placeholder: "", aiHint: "", options: [] },
];

export const CharacterCreationSchema = z.object({
  fields: z.array(CharacterFieldSchema).default(BASE_CHARACTER_FIELDS),
  startingAbilityIds: z.array(IdSchema).default([]),
  startingItems: z.array(z.object({ itemId: IdSchema, quantity: z.number().int().min(1).default(1) })).default([]),
  /** Free points the player may distribute among attribute stats. */
  attributePoints: z.number().int().min(0).default(0),
  specialTraits: z.array(z.string()).default([]),
});
export type CharacterCreation = z.infer<typeof CharacterCreationSchema>;

export const StartingConditionsSchema = z.object({
  date: GameTimeSchema,
  locationId: IdSchema,
  situation: z.string().default(""),
  playerAge: z.string().default(""),
  playerBackground: z.string().default(""),
  /** Does the protagonist know how the "original" story goes? */
  playerKnowledge: z.enum(["none", "partial", "full"]).default("none"),
  /** What the protagonist knows in advance (canon knowledge, meta knowledge). */
  knownFacts: z.array(z.string()).default([]),
  playerSecrets: z.array(SecretSchema).default([]),
  currency: z.record(z.string(), z.number()).default({}),
  activeQuestIds: z.array(IdSchema).default([]),
  flags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])).default({}),
  openingScene: z.string().default(""),
});
export type StartingConditions = z.infer<typeof StartingConditionsSchema>;

// ---------------------------------------------------------------------------
// Scenario aggregate
// ---------------------------------------------------------------------------

export const ScenarioMetadataSchema = z.object({
  title: z.string().min(1).max(200),
  shortDescription: z.string().max(600).default(""),
  fullDescription: z.string().default(""),
  coverImage: z.string().optional(),
  language: z.string().default("ru"),
  authorName: z.string().default("Аноним"),
  /** original = author's own world; fan = based on an existing work. Engine treats both the same. */
  origin: z.enum(["original", "fan"]).default("original"),
  fandom: z.string().default(""),
  allowRemix: z.boolean().default(true),
  originalScenarioId: z.string().optional(),
  originalAuthor: z.string().optional(),
  requiredAppVersion: z.string().default(APP_VERSION),
});
export type ScenarioMetadata = z.infer<typeof ScenarioMetadataSchema>;

export const ScenarioTagsSchema = z.object({
  genre: z.array(z.string()).default([]),
  setting: z.array(z.string()).default([]),
  tone: z.array(z.string()).default([]),
  themes: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  content: z.array(z.string()).default([]),
});
export type ScenarioTags = z.infer<typeof ScenarioTagsSchema>;

export const WorldSchema = z.object({
  name: z.string().default(""),
  description: z.string().default(""),
  history: z.string().default(""),
  geography: z.string().default(""),
  technologyLevel: z.string().default(""),
  magicSystem: z.string().default(""),
  powerSystem: z.string().default(""),
  politics: z.string().default(""),
  economy: z.string().default(""),
  culture: z.string().default(""),
  religion: z.string().default(""),
  importantRules: z.array(z.string()).default([]),
});
export type World = z.infer<typeof WorldSchema>;

export const MechanicsSchema = z.object({
  stats: z.array(StatDefinitionSchema).default([]),
  healthResourceId: z.string().default("health"),
  energyResourceId: z.string().default("energy"),
  equipmentSlots: z.array(z.string()).default(["weapon", "body", "accessory"]),
  abilityCategories: z.array(AbilityCategorySchema).default(DEFAULT_ABILITY_CATEGORIES),
  relationshipAxes: z.array(RelationshipAxisSchema).default(DEFAULT_RELATIONSHIP_AXES),
});
export type Mechanics = z.infer<typeof MechanicsSchema>;

export const ScenarioSchema = z.object({
  formatVersion: z.number().int().min(1).default(SCENARIO_FORMAT_VERSION),
  id: z.string().min(1),
  /** Semantic version of this scenario's content ("1.0.0"). */
  version: z.string().regex(/^\d+\.\d+(\.\d+)?$/).default("1.0.0"),
  metadata: ScenarioMetadataSchema,
  tags: ScenarioTagsSchema.prefault({}),
  world: WorldSchema.prefault({}),
  calendar: CalendarSchema.prefault({}),
  mechanics: MechanicsSchema.prefault({}),
  locations: z.array(LocationSchema).default([]),
  npcs: z.array(NPCSchema).default([]),
  factions: z.array(FactionSchema).default([]),
  abilities: z.array(AbilitySchema).default([]),
  items: z.array(ItemSchema).default([]),
  lore: z.array(LoreEntrySchema).default([]),
  quests: z.array(QuestSchema).default([]),
  timeline: z.array(TimelineEventSchema).default([]),
  system: GameSystemSchema.prefault({}),
  characterCreation: CharacterCreationSchema.prefault({}),
  start: StartingConditionsSchema,
  rules: AIRulesSchema.prefault({}),
  storyHooks: z.array(z.string()).default([]),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioInput = z.input<typeof ScenarioSchema>;

export function parseScenario(input: unknown): Scenario {
  return ScenarioSchema.parse(input);
}
