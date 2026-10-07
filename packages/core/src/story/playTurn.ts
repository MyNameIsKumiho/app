import type { PlayerAction } from "../domain/actions";
import type { GameState } from "../domain/gameState";
import type { Scenario } from "../domain/scenario";
import type { SuggestedAction } from "../domain/turnResult";
import { runStoryTurn, summarize } from "../ai/operations";
import type { TextGenerator } from "../ai/structured";
import type { ApplyReport } from "../engine/applyTurnResult";
import type { SecretLeak } from "../engine/secretGuard";
import type { TimelineOutcome } from "../engine/timeline";
import { finalizeTurn, prepareTurn } from "../engine/turn";
import { compactMemory } from "../memory/memoryEngine";

export interface PlayTurnOptions {
  temperature?: number;
  contextBudget?: number;
  signal?: AbortSignal;
}

export interface PlayedTurn {
  state: GameState;
  narrative: string;
  actionSummary: string;
  suggestedActions: SuggestedAction[];
  report: ApplyReport;
  outcomes: string[];
  failures: string[];
  timeline: TimelineOutcome[];
  illustration: { worthy: boolean; description: string };
  ai: { providerId: string; model: string; attempts: number; contextTokens: number; unresolvedLeaks: SecretLeak[] };
}

/**
 * One full game turn:
 *   engine resolves mechanics → Context Engine → Storyteller (via router)
 *   → validated changes applied → time & timeline → memory compaction.
 * The input state is never mutated; a new state is returned.
 */
export async function playTurn(ai: TextGenerator, scenario: Scenario, state: GameState, action: PlayerAction, options: PlayTurnOptions = {}): Promise<PlayedTurn> {
  const prepared = prepareTurn(state, scenario, action);
  const story = await runStoryTurn(ai, {
    scenario,
    state: prepared.draft,
    resolved: prepared.resolved,
    parts: action.parts,
    heroSpeech: prepared.heroSpeech,
    temperature: options.temperature,
    contextBudget: options.contextBudget,
    signal: options.signal,
  });
  const finalized = finalizeTurn(prepared, scenario, story.result);
  await compactMemory(finalized.state, (req) => summarize(ai, req), { overflow: finalized.overflow, newArcTitle: finalized.report.newArcTitle });
  return {
    state: finalized.state,
    narrative: story.result.narrative,
    actionSummary: prepared.resolved.summary,
    suggestedActions: story.result.suggestedActions,
    report: finalized.report,
    outcomes: prepared.resolved.outcomes,
    failures: prepared.resolved.failures,
    timeline: finalized.time.timeline,
    illustration: story.result.illustration,
    ai: { providerId: story.meta.providerId, model: story.meta.model, attempts: story.attempts, contextTokens: story.context.estimatedTokens, unresolvedLeaks: story.unresolvedLeaks },
  };
}
