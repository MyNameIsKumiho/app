import type { GameState } from "../domain/gameState";
import type { Condition, Scenario } from "../domain/scenario";
import { axisById, relationValue } from "./relationships";

export function flagValue(state: GameState, key: string): boolean | number | string {
  // Missing flags read as false so conditions like `equals: false` work before the flag is ever set.
  return state.flags[key] ?? false;
}

export function evaluateCondition(state: GameState, scenario: Scenario, condition: Condition): boolean {
  switch (condition.type) {
    case "flag":
      return flagValue(state, condition.key) === condition.equals;
    case "npc_alive":
      return (state.npcs[condition.npcId]?.alive ?? false) === condition.alive;
    case "quest_status":
      return (state.quests[condition.questId]?.status ?? "inactive") === condition.status;
    case "player_at":
      return state.player.locationId === condition.locationId;
    case "relationship_at_least": {
      const npc = state.npcs[condition.npcId];
      const axis = axisById(scenario, condition.axis);
      return npc !== undefined && axis !== undefined && relationValue(npc, axis) >= condition.value;
    }
  }
}

export function evaluateAll(state: GameState, scenario: Scenario, conditions: Condition[]): boolean {
  return conditions.every((c) => evaluateCondition(state, scenario, c));
}

export function describeCondition(condition: Condition): string {
  switch (condition.type) {
    case "flag":
      return `флаг ${condition.key} = ${String(condition.equals)}`;
    case "npc_alive":
      return `${condition.npcId} ${condition.alive ? "жив" : "мёртв"}`;
    case "quest_status":
      return `квест ${condition.questId}: ${condition.status}`;
    case "player_at":
      return `герой в ${condition.locationId}`;
    case "relationship_at_least":
      return `${condition.npcId}.${condition.axis} ≥ ${condition.value}`;
  }
}
