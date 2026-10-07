import { z } from "zod";
import { GAME_STATE_VERSION, GameStateSchema, type GameState, type NPCState } from "../domain/gameState";
import type { Scenario } from "../domain/scenario";
import { toMinutes } from "../domain/time";
import { addItem, findItem } from "../engine/mutations";
import { markDiscovered, markVisited, presentNpcIds } from "../engine/world";

export const CharacterInputSchema = z.object({
  name: z.string().trim().min(1, "Нужно имя").max(80),
  fields: z.record(z.string(), z.string().max(4000)).default({}),
  /** Extra attribute points distributed by the player: statId -> points. */
  attributeAllocation: z.record(z.string(), z.number().int().min(0)).default({}),
  visualProfile: z.record(z.string(), z.string()).default({}),
});
export type CharacterInput = z.input<typeof CharacterInputSchema>;

export class CharacterValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join("; "));
  }
}

/** Checks a character against the scenario's character creation rules. */
export function validateCharacter(scenario: Scenario, input: CharacterInput): string[] {
  const parsed = CharacterInputSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.map((i) => i.message);
  const issues: string[] = [];
  const { fields, attributeAllocation } = parsed.data;
  for (const field of scenario.characterCreation.fields) {
    if (field.id === "name") continue;
    const value = fields[field.id]?.trim() ?? "";
    if (field.required && !value) issues.push(`Поле «${field.label}» обязательно`);
    if (value && field.type === "select" && !field.options.some((o) => o.value === value)) issues.push(`Недопустимое значение поля «${field.label}»`);
  }
  const spent = Object.values(attributeAllocation).reduce((a, b) => a + b, 0);
  if (spent > scenario.characterCreation.attributePoints) issues.push(`Распределено больше очков (${spent}), чем доступно (${scenario.characterCreation.attributePoints})`);
  for (const statId of Object.keys(attributeAllocation)) {
    const def = scenario.mechanics.stats.find((s) => s.id === statId);
    if (!def || def.kind !== "attribute") issues.push(`Неизвестная характеристика ${statId}`);
  }
  return issues;
}

/** Builds the initial GameState from a scenario and a created character. */
export function createGameState(scenario: Scenario, input: CharacterInput): GameState {
  const issues = validateCharacter(scenario, input);
  if (issues.length > 0) throw new CharacterValidationError(issues);
  const character = CharacterInputSchema.parse(input);
  const clock = toMinutes(scenario.start.date, scenario.calendar);

  const stats: Record<string, number> = {};
  const resources: Record<string, { current: number; max: number }> = {};
  for (const def of scenario.mechanics.stats) {
    if (def.kind === "resource") resources[def.id] = { current: def.default, max: def.default };
    else stats[def.id] = def.default + (character.attributeAllocation[def.id] ?? 0);
  }

  const npcs: Record<string, NPCState> = {};
  for (const npc of scenario.npcs) {
    npcs[npc.id] = {
      id: npc.id,
      alive: true,
      locationId: npc.startingLocationId,
      mood: npc.startingMood,
      met: false,
      relationship: { ...npc.startingRelationship },
      knowledge: [...npc.knowledge],
      knownSecretIds: [],
      memories: [],
      notes: "",
    };
  }

  const state: GameState = GameStateSchema.parse({
    stateVersion: GAME_STATE_VERSION,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    turn: 0,
    time: scenario.start.date,
    clock,
    startedAtClock: clock,
    player: {
      name: character.name,
      fields: character.fields,
      visualProfile: character.visualProfile,
      locationId: scenario.start.locationId,
      stats,
      resources,
      currency: { ...scenario.start.currency },
      secrets: scenario.start.playerSecrets.map((s) => ({ id: s.id, description: s.description, keywords: s.keywords, importance: s.importance, knownByNpcIds: [...s.knownByNpcIds] })),
      knowledge: [],
    },
    npcs,
    factions: Object.fromEntries(scenario.factions.map((f) => [f.id, { reputation: f.startingReputation }])),
    flags: { ...scenario.start.flags },
    memory: {
      currentScene: { title: "Начало", locationId: scenario.start.locationId, startedAtTurn: 0, presentNpcIds: [] },
      currentArc: { title: "Пролог", startedAtTurn: 0 },
    },
  });

  // Starting abilities: scenario defaults + grants from selected character options.
  const abilityIds = new Set(scenario.characterCreation.startingAbilityIds);
  const items: { itemId: string; quantity: number }[] = [...scenario.characterCreation.startingItems];
  for (const field of scenario.characterCreation.fields) {
    const option = field.options.find((o) => o.value === character.fields[field.id]);
    if (!option) continue;
    option.grants.abilityIds.forEach((id) => abilityIds.add(id));
    items.push(...option.grants.items);
    for (const [statId, amount] of Object.entries(option.grants.stats)) {
      if (state.player.stats[statId] !== undefined) state.player.stats[statId] = (state.player.stats[statId] ?? 0) + amount;
    }
  }
  for (const id of abilityIds) {
    const ability = scenario.abilities.find((a) => a.id === id);
    if (ability) state.player.abilities.push({ abilityId: id, mastery: ability.mastery, readyAt: 0, timesUsed: 0 });
  }
  for (const entry of items) {
    const item = findItem(scenario, entry.itemId);
    if (item) addItem(state, item, entry.quantity);
  }
  // Auto-equip one item per slot.
  for (const entry of state.player.inventory) {
    const item = findItem(scenario, entry.itemId);
    if (item?.type === "equipment" && item.slot && !state.player.equipment[item.slot]) state.player.equipment[item.slot] = item.id;
  }

  // Player knowledge: what the protagonist knows in advance (canon/meta knowledge).
  if (scenario.start.playerKnowledge !== "none") {
    for (const fact of scenario.start.knownFacts) {
      state.player.knowledge.push({ id: `know-start-${state.player.knowledge.length + 1}`, text: fact, source: "canon", turn: 0 });
    }
  }

  for (const questId of scenario.start.activeQuestIds) {
    if (scenario.quests.some((q) => q.id === questId)) state.quests[questId] = { status: "active", objectives: {}, notes: [], startedAtTurn: 0 };
  }
  for (const loc of scenario.locations) if (!loc.hidden) markDiscovered(state, loc.id);
  const startLocation = scenario.locations.find((l) => l.id === scenario.start.locationId);
  markVisited(state, scenario.start.locationId, startLocation?.name);
  state.memory.currentScene.title = startLocation?.name ?? "Начало";
  state.memory.currentScene.presentNpcIds = presentNpcIds(state);
  for (const id of state.memory.currentScene.presentNpcIds) {
    const npc = state.npcs[id];
    if (npc) npc.met = true;
  }
  if (scenario.start.openingScene) {
    state.memory.recent.push({ turn: 0, action: "", narrative: scenario.start.openingScene, locationId: scenario.start.locationId, timestamp: clock });
  }
  return state;
}
