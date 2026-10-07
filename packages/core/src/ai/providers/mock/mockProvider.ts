import type { Scenario } from "../../../domain/scenario";
import type { SummaryRequest } from "../../../memory/memoryEngine";
import type { FieldAction } from "../../../creator/fieldActions";
import type { StoryMockPayload, WizardAnswer } from "../../operations";
import { AIError, type AIProvider, type ProviderStatus, type TextRequest, type TextResult } from "../../types";
import { mockAlternatives, mockAnalyzeIdea, mockAssistant, mockCharacters, mockFieldAssist, mockReview, mockRevision, mockScenarioDraft } from "./creatorMock";
import { mockStoryTurn } from "./storyMock";

/**
 * Deterministic offline provider for development and tests. It answers from
 * the structured `mockPayload` instead of reading prompts, so its output is
 * repeatable. It is clearly labelled in the UI and never pretends to be a model.
 */
export class MockProvider implements AIProvider {
  readonly id = "mock";
  readonly label = "Демо-режим (без AI)";
  readonly kind = "mock" as const;
  /** Test hook: make the next N calls fail with this error code. */
  failNext: { code: AIError["code"]; count: number } | null = null;

  async status(): Promise<ProviderStatus> {
    return { id: this.id, label: this.label, kind: this.kind, available: true, detail: "Шаблонные ответы без нейросети: для разработки, тестов и офлайн-демо" };
  }

  async generateText(request: TextRequest): Promise<TextResult> {
    if (this.failNext && this.failNext.count > 0) {
      this.failNext.count -= 1;
      throw new AIError(this.failNext.code, "Смоделированная ошибка mock-провайдера", this.id);
    }
    const value = this.answer(request);
    return { text: typeof value === "string" ? value : JSON.stringify(value), providerId: this.id, model: "mock-1" };
  }

  private answer(request: TextRequest): unknown {
    const p = request.mockPayload as Record<string, unknown> | undefined;
    switch (request.purpose) {
      case "story_turn":
        return mockStoryTurn(p as unknown as StoryMockPayload);
      case "summarize": {
        const req = p as unknown as SummaryRequest;
        const sentences = req.text.replace(/\[Ход \d+\]/g, "").split(/(?<=[.!?…])\s+/).filter((s) => s.trim().length > 20 && !s.trim().startsWith("—"));
        return { title: req.title, summary: sentences.slice(0, 5).join(" ") || req.text.slice(0, 300), keyFacts: [] };
      }
      case "scenario_questions":
        return mockAnalyzeIdea(String(p?.idea ?? ""));
      case "scenario_draft":
        return mockScenarioDraft(String(p?.idea ?? ""), (p?.answers as WizardAnswer[]) ?? []);
      case "scenario_revise":
        return mockRevision(p?.scenario as Scenario, String(p?.instruction ?? ""));
      case "scenario_alternatives":
        return { alternatives: mockAlternatives(p?.scenario as Scenario, String(p?.instruction ?? "")) };
      case "field_assist":
        return mockFieldAssist(p as unknown as { fieldLabel: string; value: string; action: FieldAction; wish?: string });
      case "editor_assistant":
        return mockAssistant(p?.scenario as Scenario, String(p?.message ?? ""));
      case "scenario_review":
        return mockReview(p?.scenario as Scenario);
      case "character":
        return mockCharacters(p?.scenario as Scenario, String(p?.request ?? ""));
    }
  }
}

