import { slugify, uniqueId } from "../domain/common";
import { NPCStateSchema, type GameState } from "../domain/gameState";
import { LocationSchema, NPCSchema, type Location, type NPC, type Scenario } from "../domain/scenario";

/**
 * Places and characters that appear during play without being defined by the
 * scenario author ("the train station", "a stranger at the bar"). They live in
 * the game state; `withImprovised` merges them into a per-turn copy of the
 * scenario so the rest of the engine can treat them like authored ones.
 */
export function withImprovised(scenario: Scenario, state: GameState): Scenario {
  if (state.customLocations.length === 0 && state.customNpcs.length === 0) return { ...scenario, locations: [...scenario.locations], npcs: [...scenario.npcs] };
  return {
    ...scenario,
    locations: [...scenario.locations, ...state.customLocations.filter((l) => !scenario.locations.some((s) => s.id === l.id))],
    npcs: [...scenario.npcs, ...state.customNpcs.filter((n) => !scenario.npcs.some((s) => s.id === n.id))],
  };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, "е");

/** Finds a location by id or by name (the AI sometimes writes the name). */
export function findLocationRef(scenario: Scenario, ref: string): Location | undefined {
  return scenario.locations.find((l) => l.id === ref) ?? scenario.locations.find((l) => norm(l.name) === norm(ref));
}

export function findNpcRef(scenario: Scenario, ref: string): NPC | undefined {
  return scenario.npcs.find((n) => n.id === ref) ?? scenario.npcs.find((n) => norm(n.name) === norm(ref));
}

/** Adds a new place to the state and to the (per-turn) scenario copy. */
export function addImprovisedLocation(state: GameState, scenario: Scenario, name: string, description = ""): Location {
  const id = uniqueId(`place-${slugify(name, "place")}`, scenario.locations.map((l) => l.id));
  const location = LocationSchema.parse({
    id,
    name: name.slice(0, 80),
    description: description.slice(0, 600),
    // Connected both ways with the place the hero came from, so travel back is possible.
    connections: [{ locationId: state.player.locationId, travelMinutes: 15 }],
    tags: ["improvised"],
  });
  state.customLocations.push(location);
  scenario.locations.push(location);
  const from = scenario.locations.find((l) => l.id === state.player.locationId);
  if (from && !from.connections.some((c) => c.locationId === id)) {
    const custom = state.customLocations.find((l) => l.id === from.id);
    // Authored locations stay untouched; only improvised ones get the reverse link stored.
    if (custom) custom.connections.push({ locationId: id, travelMinutes: 15 });
  }
  return location;
}

/** Adds a new character to the state and to the (per-turn) scenario copy, standing next to the hero. */
export function addImprovisedNpc(state: GameState, scenario: Scenario, input: { name: string; description?: string; appearance?: string; locationId?: string }): NPC {
  const id = uniqueId(`npc-${slugify(input.name, "npc")}`, [...scenario.npcs.map((n) => n.id), ...Object.keys(state.npcs)]);
  const npc = NPCSchema.parse({
    id,
    name: input.name.slice(0, 80),
    description: (input.description ?? "").slice(0, 600),
    appearance: (input.appearance ?? "").slice(0, 400),
    importance: "minor",
  });
  state.customNpcs.push(npc);
  scenario.npcs.push(npc);
  state.npcs[id] = NPCStateSchema.parse({ id, locationId: input.locationId ?? state.player.locationId, met: true });
  return npc;
}
