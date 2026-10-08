import { z } from "zod";

/**
 * What the Storyteller AI may PROPOSE after a turn. Nothing here is applied
 * directly: engine/applyTurnResult.ts validates every entry against the
 * scenario and current GameState, and rejects what is not allowed.
 *
 * The schema is deliberately lenient (defaults, plain strings for ids) so a
 * single bad entry is rejected individually instead of failing the whole turn.
 */
const FlagValue = z.union([z.boolean(), z.number(), z.string()]);

export const StateChangeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("resource"), resourceId: z.string(), delta: z.number(), reason: z.string().default("") }),
  z.object({ type: z.literal("stat"), statId: z.string(), delta: z.number(), reason: z.string().default("") }),
  z.object({
    type: z.literal("item_add"),
    itemId: z.string(),
    quantity: z.number().int().default(1),
    /** Required for improvised items that the scenario does not define. */
    name: z.string().optional(),
    description: z.string().optional(),
    reason: z.string().default(""),
  }),
  z.object({ type: z.literal("item_remove"), itemId: z.string(), quantity: z.number().int().default(1), reason: z.string().default("") }),
  z.object({ type: z.literal("currency"), currencyId: z.string(), delta: z.number(), reason: z.string().default("") }),
  z.object({ type: z.literal("xp"), amount: z.number().int(), reason: z.string().default("") }),
  z.object({ type: z.literal("ability_learn"), abilityId: z.string(), reason: z.string().default("") }),
  z.object({ type: z.literal("ability_mastery"), abilityId: z.string(), delta: z.number(), reason: z.string().default("") }),
  z.object({ type: z.literal("effect_add"), name: z.string(), description: z.string().default(""), durationMinutes: z.number().int().optional() }),
  z.object({ type: z.literal("effect_remove"), name: z.string() }),
  z.object({
    type: z.literal("move"),
    locationId: z.string().default(""),
    /** For a place the scenario does not have yet: it is created on the fly. */
    name: z.string().optional(),
    description: z.string().optional(),
  }),
  /** The hero takes an item in hand or puts it on. `slot` defaults to the item's own slot or "hands". */
  z.object({ type: z.literal("equip"), itemId: z.string(), slot: z.string().optional() }),
  z.object({ type: z.literal("unequip"), itemId: z.string() }),
  z.object({ type: z.literal("flag"), key: z.string(), value: FlagValue }),
  z.object({ type: z.literal("player_knowledge"), fact: z.string() }),
  z.object({ type: z.literal("achievement"), achievementId: z.string() }),
  z.object({ type: z.literal("title"), titleId: z.string() }),
  z.object({ type: z.literal("player_death"), reason: z.string() }),
]);
export type StateChange = z.infer<typeof StateChangeSchema>;

export const RelationshipChangeSchema = z.object({
  npcId: z.string(),
  axis: z.string(),
  delta: z.number(),
  reason: z.string().default(""),
});
export type RelationshipChange = z.infer<typeof RelationshipChangeSchema>;

export const NewMemorySchema = z.object({
  /** NPC id, or "story" for the protagonist's long-term story memory. */
  owner: z.string(),
  event: z.string(),
  importance: z.number().min(0).max(100).default(30),
  emotionalImpact: z.number().min(-100).max(100).default(0),
  participants: z.array(z.string()).default([]),
});
export type NewMemory = z.infer<typeof NewMemorySchema>;

export const QuestChangeSchema = z.object({
  questId: z.string(),
  action: z.enum(["start", "complete_objective", "complete", "fail", "note"]),
  objectiveId: z.string().optional(),
  note: z.string().default(""),
});
export type QuestChange = z.infer<typeof QuestChangeSchema>;

export const WorldChangeSchema = z.object({
  description: z.string(),
  importance: z.number().min(0).max(100).default(40),
  flag: z.object({ key: z.string(), value: FlagValue }).optional(),
  factionId: z.string().optional(),
  reputationDelta: z.number().optional(),
});
export type WorldChange = z.infer<typeof WorldChangeSchema>;

export const KnowledgeChangeSchema = z.object({
  npcId: z.string(),
  /** A plain fact the NPC learned. */
  fact: z.string().optional(),
  /** A player secret id the NPC learned. */
  secretId: z.string().optional(),
  /** How they learned it. "player_told" is invalid on think-only turns. */
  source: z.enum(["player_told", "observed", "deduced", "rumor"]).default("observed"),
});
export type KnowledgeChange = z.infer<typeof KnowledgeChangeSchema>;

export const NPCUpdateSchema = z.object({
  npcId: z.string().default(""),
  /** For a character the scenario does not have yet: they are created on the fly. */
  name: z.string().optional(),
  description: z.string().optional(),
  appearance: z.string().optional(),
  mood: z.string().optional(),
  locationId: z.string().optional(),
  alive: z.boolean().optional(),
  present: z.boolean().optional(),
});
export type NPCUpdate = z.infer<typeof NPCUpdateSchema>;

export const TimelineChangeSchema = z.object({
  eventId: z.string(),
  action: z.enum(["cancel", "modify"]),
  note: z.string(),
});
export type TimelineChange = z.infer<typeof TimelineChangeSchema>;

export const SuggestedActionSchema = z.object({
  label: z.string().min(1).max(80),
  kind: z.enum(["say", "do", "think", "silent", "ability", "item", "free"]).default("do"),
  text: z.string().max(400).default(""),
});
export type SuggestedAction = z.infer<typeof SuggestedActionSchema>;

export const TurnResultSchema = z.object({
  narrative: z.string().min(1),
  /** In-game minutes the scene took. The engine enforces a minimum per action. */
  timeAdvanceMinutes: z.number().int().min(0).default(0),
  stateChanges: z.array(StateChangeSchema).default([]),
  relationshipChanges: z.array(RelationshipChangeSchema).default([]),
  newMemories: z.array(NewMemorySchema).default([]),
  questChanges: z.array(QuestChangeSchema).default([]),
  worldChanges: z.array(WorldChangeSchema).default([]),
  knowledgeChanges: z.array(KnowledgeChangeSchema).default([]),
  npcUpdates: z.array(NPCUpdateSchema).default([]),
  timelineChanges: z.array(TimelineChangeSchema).default([]),
  sceneChange: z.object({ title: z.string(), locationId: z.string().optional(), newArc: z.string().optional() }).optional(),
  suggestedActions: z.array(SuggestedActionSchema).max(6).default([]),
  illustration: z.object({ worthy: z.boolean().default(false), description: z.string().default("") }).prefault({}),
});
export type TurnResult = z.infer<typeof TurnResultSchema>;
