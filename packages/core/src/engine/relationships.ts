import { clamp } from "../domain/common";
import type { NPCState } from "../domain/gameState";
import type { RelationshipAxis, Scenario } from "../domain/scenario";

export function axisById(scenario: Scenario, axisId: string): RelationshipAxis | undefined {
  return scenario.mechanics.relationshipAxes.find((a) => a.id === axisId);
}

export function relationValue(npc: NPCState, axis: RelationshipAxis): number {
  return npc.relationship[axis.id] ?? axis.default;
}

/** Human label for a numeric axis value ("Доверие: Высокое"). Numbers stay internal. */
export function relationLabel(axis: RelationshipAxis, value: number): string {
  const sorted = [...axis.levels].sort((a, b) => b.min - a.min);
  return sorted.find((level) => value >= level.min)?.label ?? String(Math.round(value));
}

export interface RelationshipView {
  axisId: string;
  label: string;
  level: string;
  /** Only exposed to UI when the caller explicitly asks for numbers (debug/advanced). */
  value: number;
}

export function describeRelationship(scenario: Scenario, npc: NPCState, includeHidden = false): RelationshipView[] {
  return scenario.mechanics.relationshipAxes
    .filter((axis) => includeHidden || !axis.hiddenFromPlayer)
    .map((axis) => {
      const value = relationValue(npc, axis);
      return { axisId: axis.id, label: axis.label, level: relationLabel(axis, value), value };
    });
}

/** Max change of one axis per turn: prevents the AI from flipping an enemy into a lover in one line. */
export const MAX_RELATIONSHIP_DELTA_PER_TURN = 20;

export function applyRelationshipDelta(npc: NPCState, axis: RelationshipAxis, delta: number): { from: number; to: number } {
  const from = relationValue(npc, axis);
  const bounded = clamp(delta, -MAX_RELATIONSHIP_DELTA_PER_TURN, MAX_RELATIONSHIP_DELTA_PER_TURN);
  const to = clamp(from + bounded, axis.min, axis.max);
  npc.relationship[axis.id] = to;
  return { from, to };
}
