import { z } from "zod";
import {
  MAX_USER_TEXT,
  FIELD_ACTION_LABELS,
  ScenarioPatchSchema,
  ScenarioSchema,
  analyzeIdea,
  applyPatch,
  assistField,
  editorAssistant,
  generateCharacters,
  DRAFT_STAGES,
  finishScenarioDraft,
  generateDraftStage,
  proposeAlternatives,
  proposeRevision,
  reviewScenario,
  validateScenario,
  type FieldAction,
  type Scenario,
  type TextGenerator,
} from "@aetherfall/core/server";
import { ApiError } from "./http";
import { newScenarioId } from "./scenarios";

/**
 * Scenario creator operations. Every AI result is a proposal: drafts and
 * patches are returned to the UI and only saved when the author confirms.
 */

const FieldActionSchema = z.enum(Object.keys(FIELD_ACTION_LABELS) as [FieldAction, ...FieldAction[]]);

export const CreatorRequestSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("analyze"), idea: z.string().trim().min(10, "Опишите идею хотя бы одним предложением").max(MAX_USER_TEXT) }),
  z.object({
    op: z.literal("draft"),
    idea: z.string().trim().min(10).max(MAX_USER_TEXT),
    answers: z.array(z.object({ questionId: z.string(), question: z.string(), answer: z.string() })).max(30),
    authorName: z.string().trim().min(1).max(80),
    /** One step of the draft; without it all steps run in this request. */
    stage: z.enum(DRAFT_STAGES).optional(),
    partial: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({ op: z.literal("revise"), scenario: z.unknown(), instruction: z.string().trim().min(3).max(MAX_USER_TEXT) }),
  z.object({ op: z.literal("alternatives"), scenario: z.unknown(), instruction: z.string().trim().min(3).max(MAX_USER_TEXT) }),
  z.object({ op: z.literal("apply_patch"), scenario: z.unknown(), patch: z.unknown() }),
  z.object({
    op: z.literal("field"),
    scenario: z.unknown(),
    fieldLabel: z.string().min(1).max(200),
    value: z.string().max(MAX_USER_TEXT),
    action: FieldActionSchema,
    wish: z.string().max(MAX_USER_TEXT).optional(),
  }),
  z.object({
    op: z.literal("assistant"),
    scenario: z.unknown(),
    message: z.string().trim().min(1).max(MAX_USER_TEXT),
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(MAX_USER_TEXT) })).max(20).default([]),
  }),
  z.object({ op: z.literal("review"), scenario: z.unknown() }),
  z.object({ op: z.literal("validate"), scenario: z.unknown() }),
  z.object({ op: z.literal("characters"), scenarioId: z.string().min(1), request: z.string().max(MAX_USER_TEXT).default("") }),
]);
export type CreatorRequest = z.input<typeof CreatorRequestSchema>;

/** `loadScenario` resolves ids for players who only see the public scenario view. */
export async function runCreator(ai: TextGenerator, raw: unknown, loadScenario: (id: string) => Scenario): Promise<unknown> {
  const req = CreatorRequestSchema.parse(raw);
  const scenarioOf = (value: unknown) => {
    const parsed = ScenarioSchema.safeParse(value);
    if (!parsed.success) throw new ApiError(400, "Сценарий повреждён", parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`));
    return parsed.data;
  };
  switch (req.op) {
    case "analyze":
      return analyzeIdea(ai, req.idea);
    case "draft": {
      const stages = req.stage ? [req.stage] : DRAFT_STAGES;
      let partial = req.partial;
      for (const stage of stages) partial = await generateDraftStage(ai, { idea: req.idea, answers: req.answers, stage, partial });
      const last = stages[stages.length - 1] === DRAFT_STAGES[DRAFT_STAGES.length - 1];
      if (!last) return { partial };
      const scenario = finishScenarioDraft(partial, newScenarioId("draft"), req.authorName);
      return { partial, scenario, validation: validateScenario(scenario) };
    }
    case "revise":
      return { patch: await proposeRevision(ai, scenarioOf(req.scenario), req.instruction) };
    case "alternatives":
      return { patches: await proposeAlternatives(ai, scenarioOf(req.scenario), req.instruction) };
    case "apply_patch": {
      const result = applyPatch(scenarioOf(req.scenario), ScenarioPatchSchema.parse(req.patch));
      if (!result.ok) throw new ApiError(422, "Изменение нельзя применить", result.errors);
      return { scenario: result.scenario, validation: validateScenario(result.scenario) };
    }
    case "field":
      return assistField(ai, { scenario: scenarioOf(req.scenario), fieldLabel: req.fieldLabel, value: req.value, action: req.action, wish: req.wish });
    case "assistant":
      return editorAssistant(ai, { scenario: scenarioOf(req.scenario), history: req.history, message: req.message });
    case "review":
      return reviewScenario(ai, scenarioOf(req.scenario));
    case "validate":
      return validateScenario(scenarioOf(req.scenario));
    case "characters":
      return generateCharacters(ai, { scenario: loadScenario(req.scenarioId), request: req.request });
  }
}
