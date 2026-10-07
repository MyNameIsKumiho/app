import { nextId, type GameState } from "../domain/gameState";
import type { Scenario, TimelineEvent } from "../domain/scenario";
import { fromMinutes, timelineDateToMinutes } from "../domain/time";
import { describeCondition, evaluateAll, evaluateCondition } from "./conditions";
import { addJournal, applyEffect } from "./mutations";

export interface TimelineOutcome {
  eventId: string;
  title: string;
  status: "occurred" | "cancelled";
  description: string;
  /** True when the hero is where it happened (the Storyteller should show it). */
  witnessed: boolean;
}

function addDivergence(state: GameState, event: TimelineEvent, description: string): void {
  state.divergences.push({ id: nextId(state, "div"), turn: state.turn, eventId: event.id, description, importance: event.importance });
}

function happen(state: GameState, scenario: Scenario, event: TimelineEvent, note: string): TimelineOutcome {
  for (const effect of event.effects) applyEffect(state, scenario, effect, event.title);
  const text = [event.outcome || event.description, note].filter(Boolean).join(" ");
  state.worldFacts.push({ id: nextId(state, "fact"), text, importance: event.importance, turn: state.turn, timestamp: state.clock });
  for (const npcId of event.participants) {
    const npc = state.npcs[npcId];
    if (!npc?.alive) continue;
    npc.memories.push({
      id: nextId(state, "mem"),
      event: text,
      importance: event.importance,
      emotionalImpact: 0,
      timestamp: state.clock,
      turn: state.turn,
      participants: event.participants,
    });
    if (!npc.knowledge.includes(text)) npc.knowledge.push(text);
  }
  const witnessed = event.locationId === undefined || event.locationId === state.player.locationId;
  if (witnessed || !event.hidden) addJournal(state, "event", `${event.title}: ${text}`);
  return { eventId: event.id, title: event.title, status: "occurred", description: text, witnessed };
}

/**
 * Resolves scheduled world events whose date has passed. The timeline never
 * forces the story back to the original: if the hero made an event
 * impossible, it is cancelled and recorded as a divergence.
 */
export function processTimeline(state: GameState, scenario: Scenario): TimelineOutcome[] {
  const due = scenario.timeline
    .filter((event) => {
      const status = state.timeline[event.id]?.status ?? "pending";
      return (status === "pending" || status === "modified") && timelineDateToMinutes(event.date, scenario.calendar) <= state.clock;
    })
    .sort((a, b) => timelineDateToMinutes(a.date, scenario.calendar) - timelineDateToMinutes(b.date, scenario.calendar));

  const outcomes: TimelineOutcome[] = [];
  for (const event of due) {
    const current = state.timeline[event.id] ?? { status: "pending" as const, note: "" };
    const deadParticipants = event.participants.filter((id) => state.npcs[id] && !state.npcs[id]?.alive);
    const failed = event.conditions.filter((c) => !evaluateCondition(state, scenario, c));
    const possible = event.mutable ? failed.length === 0 && deadParticipants.length === 0 : deadParticipants.length === 0;

    if (!possible) {
      const reason = deadParticipants.length > 0
        ? `участники мертвы: ${deadParticipants.join(", ")}`
        : `изменились условия: ${failed.map(describeCondition).join("; ")}`;
      state.timeline[event.id] = { status: "cancelled", note: reason, resolvedAt: state.clock };
      addDivergence(state, event, `Событие «${event.title}» не произошло (${reason}).`);
      outcomes.push({ eventId: event.id, title: event.title, status: "cancelled", description: reason, witnessed: false });
      continue;
    }
    const outcome = happen(state, scenario, event, current.status === "modified" ? current.note : "");
    state.timeline[event.id] = { status: "occurred", note: current.note, resolvedAt: state.clock };
    outcomes.push(outcome);
  }
  return outcomes;
}

/** Removes expired temporary effects. */
export function expireEffects(state: GameState): string[] {
  const expired = state.player.activeEffects.filter((e) => e.expiresAt !== undefined && e.expiresAt <= state.clock);
  state.player.activeEffects = state.player.activeEffects.filter((e) => !expired.includes(e));
  return expired.map((e) => e.name);
}

export interface TimeAdvanceReport {
  minutes: number;
  expiredEffects: string[];
  timeline: TimelineOutcome[];
}

export function advanceTime(state: GameState, scenario: Scenario, minutes: number): TimeAdvanceReport {
  state.clock += Math.max(0, Math.round(minutes));
  state.time = fromMinutes(state.clock, scenario.calendar);
  return { minutes, expiredEffects: expireEffects(state), timeline: processTimeline(state, scenario) };
}

export interface TimelineView {
  event: TimelineEvent;
  status: "pending" | "occurred" | "modified" | "cancelled";
  note: string;
  conditionsMet: boolean;
}

/** Original vs current timeline, for the UI and the Storyteller. */
export function timelineView(state: GameState, scenario: Scenario): TimelineView[] {
  return scenario.timeline.map((event) => ({
    event,
    status: state.timeline[event.id]?.status ?? "pending",
    note: state.timeline[event.id]?.note ?? "",
    conditionsMet: evaluateAll(state, scenario, event.conditions),
  }));
}
