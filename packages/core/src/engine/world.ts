import type { GameState } from "../domain/gameState";
import type { Scenario } from "../domain/scenario";
import { addJournal } from "./mutations";

export function markVisited(state: GameState, locationId: string, name = locationId): void {
  const loc = state.locations[locationId] ?? { discovered: false, visited: false, notes: [] };
  const firstVisit = !loc.visited;
  loc.discovered = true;
  loc.visited = true;
  state.locations[locationId] = loc;
  if (firstVisit) addJournal(state, "location", `Впервые: ${name}`);
}

export function markDiscovered(state: GameState, locationId: string): void {
  const loc = state.locations[locationId] ?? { discovered: false, visited: false, notes: [] };
  loc.discovered = true;
  state.locations[locationId] = loc;
}

/**
 * Shortest travel time between two locations through known (discovered)
 * locations. Returns null when there is no known route.
 */
export function findRoute(state: GameState, scenario: Scenario, fromId: string, toId: string): number | null {
  const known = (id: string) => state.locations[id]?.discovered === true || !scenario.locations.find((l) => l.id === id)?.hidden;
  if (!known(toId)) return null;
  const dist = new Map<string, number>([[fromId, 0]]);
  const queue: string[] = [fromId];
  while (queue.length > 0) {
    queue.sort((a, b) => (dist.get(a) ?? 0) - (dist.get(b) ?? 0));
    const current = queue.shift();
    if (current === undefined) break;
    if (current === toId) return dist.get(current) ?? null;
    const loc = scenario.locations.find((l) => l.id === current);
    for (const edge of loc?.connections ?? []) {
      if (!known(edge.locationId)) continue;
      const nd = (dist.get(current) ?? 0) + edge.travelMinutes;
      if (nd < (dist.get(edge.locationId) ?? Infinity)) {
        dist.set(edge.locationId, nd);
        queue.push(edge.locationId);
      }
    }
  }
  return null;
}

/** NPCs that are alive and in the hero's current location. */
export function presentNpcIds(state: GameState): string[] {
  return Object.values(state.npcs)
    .filter((n) => n.alive && n.locationId === state.player.locationId)
    .map((n) => n.id);
}
