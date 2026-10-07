import { clamp } from "../domain/common";
import { nextId, type GameState, type JournalEntry } from "../domain/gameState";
import type { Effect, Item, Scenario, StatDefinition } from "../domain/scenario";

/** Small, reusable state mutations shared by the action resolver, timeline and AI-change applier. */

/** Scenario items plus improvised items created during play (sticks, notes, trophies). */
export function findItem(scenario: Scenario, itemId: string, state?: GameState): Item | undefined {
  return scenario.items.find((i) => i.id === itemId) ?? state?.customItems.find((i) => i.id === itemId);
}

export function findStat(scenario: Scenario, statId: string): StatDefinition | undefined {
  return scenario.mechanics.stats.find((s) => s.id === statId);
}

export function itemQuantity(state: GameState, itemId: string): number {
  return state.player.inventory.find((e) => e.itemId === itemId)?.quantity ?? 0;
}

export function addItem(state: GameState, item: Item, quantity: number): void {
  const entry = state.player.inventory.find((e) => e.itemId === item.id);
  if (entry && item.stackable) entry.quantity += quantity;
  else if (entry) entry.quantity = Math.max(1, entry.quantity); // non-stackable: owning one is enough
  else state.player.inventory.push({ itemId: item.id, quantity: item.stackable ? quantity : 1 });
}

/** Returns false when the player does not have enough. */
export function removeItem(state: GameState, itemId: string, quantity: number): boolean {
  const entry = state.player.inventory.find((e) => e.itemId === itemId);
  if (!entry || entry.quantity < quantity) return false;
  entry.quantity -= quantity;
  if (entry.quantity === 0) {
    state.player.inventory = state.player.inventory.filter((e) => e.itemId !== itemId);
    for (const [slot, equipped] of Object.entries(state.player.equipment)) {
      if (equipped === itemId) delete state.player.equipment[slot];
    }
  }
  return true;
}

export function changeResource(state: GameState, resourceId: string, amount: number): { from: number; to: number } | null {
  const pool = state.player.resources[resourceId];
  if (!pool) return null;
  const from = pool.current;
  pool.current = clamp(pool.current + amount, 0, pool.max);
  return { from, to: pool.current };
}

export function changeStat(state: GameState, scenario: Scenario, statId: string, amount: number): { from: number; to: number } | null {
  const def = findStat(scenario, statId);
  if (!def || def.kind !== "attribute") return null;
  const from = state.player.stats[statId] ?? def.default;
  const to = clamp(from + amount, def.min, def.max);
  state.player.stats[statId] = to;
  return { from, to };
}

export function setFlag(state: GameState, key: string, value: boolean | number | string): void {
  state.flags[key] = value;
}

export function addStatusEffect(state: GameState, name: string, description: string, durationMinutes: number | undefined, source: string): void {
  state.player.activeEffects = state.player.activeEffects.filter((e) => e.name !== name);
  state.player.activeEffects.push({
    id: nextId(state, "effect"),
    name,
    description,
    expiresAt: durationMinutes !== undefined ? state.clock + durationMinutes : undefined,
    source,
  });
}

/** Applies a scenario-defined deterministic effect. Returns a human description for the log. */
export function applyEffect(state: GameState, scenario: Scenario, effect: Effect, source: string): string | null {
  switch (effect.type) {
    case "resource": {
      const res = changeResource(state, effect.resourceId, effect.amount);
      if (!res) return null;
      const name = findStat(scenario, effect.resourceId)?.name ?? effect.resourceId;
      return `${name}: ${Math.round(res.from)} → ${Math.round(res.to)}`;
    }
    case "stat": {
      const res = changeStat(state, scenario, effect.statId, effect.amount);
      if (!res) return null;
      return `${findStat(scenario, effect.statId)?.name ?? effect.statId}: ${res.from} → ${res.to}`;
    }
    case "status":
      addStatusEffect(state, effect.name, effect.description, effect.durationMinutes, source);
      return `Эффект «${effect.name}»`;
    case "flag":
      setFlag(state, effect.key, effect.value);
      return null;
  }
}

/** Effective attribute values: base + bonuses from equipped items. */
export function effectiveStats(state: GameState, scenario: Scenario): Record<string, number> {
  const result: Record<string, number> = {};
  for (const def of scenario.mechanics.stats) {
    if (def.kind === "attribute") result[def.id] = state.player.stats[def.id] ?? def.default;
  }
  for (const itemId of Object.values(state.player.equipment)) {
    for (const effect of findItem(scenario, itemId, state)?.effects ?? []) {
      if (effect.type === "stat" && result[effect.statId] !== undefined) {
        result[effect.statId] = (result[effect.statId] ?? 0) + effect.amount;
      }
    }
  }
  return result;
}

export function addJournal(state: GameState, kind: JournalEntry["kind"], text: string): void {
  state.journal.entries.push({ id: nextId(state, "journal"), kind, text, turn: state.turn, timestamp: state.clock });
}

export function addPlayerKnowledge(state: GameState, text: string, source: "learned" | "deduced" | "system" | "canon" | "start"): boolean {
  const normalized = text.trim().toLowerCase();
  if (state.player.knowledge.some((k) => k.text.trim().toLowerCase() === normalized)) return false;
  state.player.knowledge.push({ id: nextId(state, "know"), text: text.trim(), source, turn: state.turn });
  return true;
}
