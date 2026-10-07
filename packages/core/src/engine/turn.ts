import type { PlayerAction } from "../domain/actions";
import type { GameState } from "../domain/gameState";
import type { Scenario } from "../domain/scenario";
import type { TurnResult } from "../domain/turnResult";
import { resolvePlayerAction, type ResolvedAction } from "./actions";
import { applyTurnResult, type ApplyReport } from "./applyTurnResult";
import { advanceTime, type TimeAdvanceReport } from "./timeline";
import { markVisited, presentNpcIds } from "./world";

/** Hard cap so a single narrated scene cannot skip more than a week. */
export const MAX_TURN_MINUTES = 60 * 24 * 7;
export const RECENT_LOG_LIMIT = 8;

export interface PreparedTurn {
  /** Working copy; the caller's state is never mutated. */
  draft: GameState;
  resolved: ResolvedAction;
  presentBefore: string[];
  heroSpeech: string;
}

export function prepareTurn(state: GameState, scenario: Scenario, action: PlayerAction): PreparedTurn {
  const draft = structuredClone(state);
  draft.turn += 1;
  const presentBefore = presentNpcIds(draft);
  const resolved = resolvePlayerAction(draft, scenario, action);
  const heroSpeech = action.parts
    .map((p) => (p.kind === "say" || p.kind === "free" || p.kind === "do" ? p.text : ""))
    .join(" ");
  return { draft, resolved, presentBefore, heroSpeech };
}

export interface FinalizedTurn {
  state: GameState;
  report: ApplyReport;
  time: TimeAdvanceReport;
  /** Recent entries that were pushed out of the recent window and must be summarized. */
  overflow: GameState["memory"]["recent"];
  sceneEnded: boolean;
}

export function finalizeTurn(prepared: PreparedTurn, scenario: Scenario, result: TurnResult): FinalizedTurn {
  const { draft: state, resolved, presentBefore } = prepared;
  const locationBefore = state.memory.currentScene.locationId;

  const presentAfterAction = presentNpcIds(state);
  const report = applyTurnResult(state, scenario, result, {
    resolved,
    presentNpcIds: [...new Set([...presentBefore, ...presentAfterAction])],
  });

  const minutes = Math.min(MAX_TURN_MINUTES, Math.max(resolved.minutes, result.timeAdvanceMinutes));
  const time = advanceTime(state, scenario, minutes);

  const present = presentNpcIds(state);
  for (const id of present) {
    const npc = state.npcs[id];
    if (npc && !npc.met) npc.met = true;
  }
  markVisited(state, state.player.locationId, scenario.locations.find((l) => l.id === state.player.locationId)?.name);

  const locationChanged = state.player.locationId !== locationBefore;
  const sceneEnded = locationChanged || report.sceneTitle !== undefined || report.newArcTitle !== undefined;
  if (sceneEnded) {
    state.memory.currentScene = {
      title: report.sceneTitle ?? scenario.locations.find((l) => l.id === state.player.locationId)?.name ?? "Новая сцена",
      locationId: state.player.locationId,
      startedAtTurn: state.turn,
      presentNpcIds: present,
    };
  } else {
    state.memory.currentScene.presentNpcIds = present;
  }

  state.memory.recent.push({
    turn: state.turn,
    action: resolved.summary,
    narrative: result.narrative,
    locationId: state.player.locationId,
    timestamp: state.clock,
  });
  const overflow = state.memory.recent.length > RECENT_LOG_LIMIT ? state.memory.recent.splice(0, state.memory.recent.length - RECENT_LOG_LIMIT) : [];

  return { state, report, time, overflow, sceneEnded };
}
