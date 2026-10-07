import { z } from "zod";
import { DRAFT_STAGES, type DraftStage } from "../creator/draftStages";
import type { ActionPart } from "../domain/actions";
import type { GameState } from "../domain/gameState";
import type { Scenario } from "../domain/scenario";
import { TurnResultSchema, type TurnResult } from "../domain/turnResult";
import type { ResolvedAction } from "../engine/actions";
import { detectSecretLeaks, type SecretLeak } from "../engine/secretGuard";
import type { TimelineOutcome } from "../engine/timeline";
import { buildStoryContext, type BuiltContext } from "../context/contextEngine";
import { ScenarioPatchSchema, type ScenarioPatch } from "../creator/patch";
import { sanitizeScenario } from "../creator/sanitize";
import type { FieldAction } from "../creator/fieldActions";
import type { SummaryRequest, SummaryResponse } from "../memory/memoryEngine";
import { generateStructured, type TextGenerator } from "./structured";
import type { TextResult } from "./types";

/**
 * High-level AI operations. Each one builds a prompt, asks the router for a
 * structured answer, validates it with Zod and returns typed data. None of
 * them depend on a particular provider or model.
 */

// ---------------------------------------------------------------------------
// Story turn
// ---------------------------------------------------------------------------

export interface StoryMockPayload {
  heroName: string;
  turn: number;
  parts: ActionPart[];
  resolved: Pick<ResolvedAction, "summary" | "outcomes" | "failures" | "internalOnly">;
  location: { id: string; name: string; description: string };
  present: { id: string; name: string; mood: string; speechStyle: string }[];
  activeObjectives: { questId: string; objectiveId: string; description: string }[];
  abilityNames: string[];
  connectedLocations: { id: string; name: string }[];
  worldEvents: { title: string; description: string; witnessed: boolean }[];
}

export interface StoryTurnInput {
  scenario: Scenario;
  /** Draft state after the engine resolved the action. */
  state: GameState;
  resolved: ResolvedAction;
  parts: ActionPart[];
  heroSpeech: string;
  worldEvents?: TimelineOutcome[];
  temperature?: number;
  contextBudget?: number;
  signal?: AbortSignal;
}

export interface StoryTurnOutput {
  result: TurnResult;
  meta: TextResult;
  context: BuiltContext;
  attempts: number;
  /** Leaks that survived the retry (logged, not shown to NPCs as knowledge). */
  unresolvedLeaks: SecretLeak[];
}

function storyMockPayload(input: StoryTurnInput): StoryMockPayload {
  const { scenario, state } = input;
  const location = scenario.locations.find((l) => l.id === state.player.locationId);
  return {
    heroName: state.player.name,
    turn: state.turn,
    parts: input.parts,
    resolved: { summary: input.resolved.summary, outcomes: input.resolved.outcomes, failures: input.resolved.failures, internalOnly: input.resolved.internalOnly },
    location: { id: state.player.locationId, name: location?.name ?? state.player.locationId, description: location?.description ?? "" },
    present: state.memory.currentScene.presentNpcIds.map((id) => {
      const def = scenario.npcs.find((n) => n.id === id);
      return { id, name: def?.name ?? id, mood: state.npcs[id]?.mood ?? "", speechStyle: def?.speechStyle ?? "" };
    }),
    activeObjectives: Object.entries(state.quests)
      .filter(([, q]) => q.status === "active")
      .flatMap(([questId, q]) =>
        (scenario.quests.find((d) => d.id === questId)?.objectives ?? []).filter((o) => !q.objectives[o.id]).map((o) => ({ questId, objectiveId: o.id, description: o.description })),
      ),
    abilityNames: state.player.abilities.map((a) => scenario.abilities.find((d) => d.id === a.abilityId)?.name ?? a.abilityId),
    connectedLocations: (location?.connections ?? []).map((c) => ({ id: c.locationId, name: scenario.locations.find((l) => l.id === c.locationId)?.name ?? c.locationId })),
    worldEvents: (input.worldEvents ?? []).filter((e) => e.status === "occurred").map((e) => ({ title: e.title, description: e.description, witnessed: e.witnessed })),
  };
}

const RESPONSE_TOKENS = { short: 1800, medium: 3000, long: 5000 } as const;

export async function runStoryTurn(ai: TextGenerator, input: StoryTurnInput): Promise<StoryTurnOutput> {
  const present = input.state.memory.currentScene.presentNpcIds;
  const call = async (correction?: string) => {
    const context = buildStoryContext({ scenario: input.scenario, state: input.state, resolved: input.resolved, worldEvents: input.worldEvents, budgetTokens: input.contextBudget, correction });
    const res = await generateStructured(
      ai,
      {
        purpose: "story_turn",
        system: context.system,
        messages: [{ role: "user", content: context.user }],
        temperature: input.temperature ?? 0.9,
        maxOutputTokens: RESPONSE_TOKENS[input.scenario.rules.responseLength],
        mockPayload: storyMockPayload(input),
        signal: input.signal,
      },
      TurnResultSchema,
    );
    return { ...res, context };
  };

  let out = await call();
  let leaks = detectSecretLeaks(input.state, out.value.narrative, present, input.heroSpeech);
  if (leaks.length > 0) {
    const correction = `В прошлой версии NPC упомянули то, чего не знают (${leaks.map((l) => `«${l.excerpt}»`).join("; ")}). Перепиши сцену: NPC не знают секретов героя и не намекают на них.`;
    const retry = await call(correction);
    const retryLeaks = detectSecretLeaks(input.state, retry.value.narrative, present, input.heroSpeech);
    if (retryLeaks.length <= leaks.length) {
      out = { ...retry, attempts: retry.attempts + out.attempts };
      leaks = retryLeaks;
    }
  }
  return { result: out.value, meta: out.result, context: out.context, attempts: out.attempts, unresolvedLeaks: leaks };
}

// ---------------------------------------------------------------------------
// Memory summarization
// ---------------------------------------------------------------------------

const SummarySchema = z.object({
  title: z.string().default(""),
  summary: z.string().min(1),
  keyFacts: z.array(z.object({ text: z.string(), importance: z.number().min(0).max(100) })).default([]),
});

export async function summarize(ai: TextGenerator, request: SummaryRequest): Promise<SummaryResponse> {
  const res = await generateStructured(
    ai,
    {
      purpose: "summarize",
      system:
        "Ты ведёшь летопись интерактивной истории. Сжимай события, не теряя фактов: кто, что сделал, что изменилось, какие обещания, долги, тайны и последствия появились. Отдельно перечисли ключевые факты с важностью 0–100 (≥80 — то, что нельзя забыть никогда: смерти, клятвы, раскрытые тайны, крупные изменения мира). Ответь JSON: {\"title\":\"...\",\"summary\":\"...\",\"keyFacts\":[{\"text\":\"...\",\"importance\":70}]}",
      messages: [{ role: "user", content: `Тип: ${request.kind === "scene" ? "сцена" : "арка"}. Название: ${request.title}\n\n${request.text}` }],
      temperature: 0.2,
      maxOutputTokens: 1500,
      mockPayload: request,
    },
    SummarySchema,
  );
  return res.value;
}

// ---------------------------------------------------------------------------
// Scenario creator
// ---------------------------------------------------------------------------

export const IdeaAnalysisSchema = z.object({
  summary: z.string(),
  questions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        why: z.string().default(""),
        options: z.array(z.object({ id: z.string(), label: z.string(), description: z.string().default("") })).min(2).max(6),
        allowCustom: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(6),
});
export type IdeaAnalysis = z.infer<typeof IdeaAnalysisSchema>;

export interface WizardAnswer {
  questionId: string;
  question: string;
  answer: string;
}

const CREATOR_SYSTEM =
  "Ты — соавтор интерактивных историй и гейм-дизайнер. Помогаешь автору построить сценарий для приложения, где AI-рассказчик ведёт историю, а приложение хранит состояние игры. Не придумывай за автора окончательных решений молча: предлагай варианты. Пиши по-русски, если автор пишет по-русски. Не используй защищённые торговые марки в названиях, если автор сам их не назвал.";

function scenarioJson(scenario: Scenario, maxChars = 60_000): string {
  const json = JSON.stringify(scenario);
  return json.length > maxChars ? `${json.slice(0, maxChars)}…(обрезано)` : json;
}

export async function analyzeIdea(ai: TextGenerator, idea: string): Promise<IdeaAnalysis> {
  const res = await generateStructured(
    ai,
    {
      purpose: "scenario_questions",
      system: CREATOR_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Идея автора:\n«${idea}»\n\nПроанализируй идею и задай 3–5 действительно важных вопросов, от которых зависит сценарий (время начала, как работает сила/система героя, стартовая точка, стиль, роль героя и т.п.). У каждого вопроса 2–5 вариантов ответа (A, B, C...) с коротким пояснением. Ответь JSON: {"summary":"как ты понял идею","questions":[{"id":"start_time","question":"...","why":"зачем это важно","options":[{"id":"a","label":"...","description":"..."}],"allowCustom":true}]}`,
        },
      ],
      temperature: 0.7,
      maxOutputTokens: 2500,
      mockPayload: { idea },
    },
    IdeaAnalysisSchema,
  );
  return res.value;
}

const SCENARIO_FORMAT_HINT = `Формат сценария (JSON). Обязательно: metadata.title, world, locations (с id и connections), npcs, start. Поля:
{"metadata":{"title","shortDescription","fullDescription","origin":"original|fan","fandom"},
 "tags":{"genre":[],"setting":[],"tone":[],"themes":[],"features":[],"content":[]},
 "world":{"name","description","history","geography","technologyLevel","magicSystem","powerSystem","politics","economy","culture","religion","importantRules":[]},
 "calendar":{"monthNames":[],"daysPerMonth":30},
 "mechanics":{"stats":[{"id":"health","name":"Здоровье","kind":"resource","default":100},{"id":"energy","name":"Энергия","kind":"resource","default":50},{"id":"strength","name":"Сила","kind":"attribute","default":10}]},
 "locations":[{"id","name","description","connections":[{"locationId","travelMinutes"}]}],
 "npcs":[{"id","name","description","appearance","personality","speechStyle","goals":[],"fears":[],"secrets":[{"id","description"}],"startingLocationId","knowledge":[],"startingMood","aiInstructions","importance":"major|minor","factionIds":[]}],
 "factions":[{"id","name","description","leaderId","memberIds":[],"goals":[],"enemyIds":[],"allyIds":[]}],
 "abilities":[{"id","name","description","category":"attack|defense|control|support|healing|movement|utility|passive|forbidden|special","difficulty":1-10,"mastery":0-100,"energyCost","cooldown"}],
 "items":[{"id","name","description","type":"consumable|equipment|key|material|misc","slot","effects":[{"type":"resource","resourceId":"health","amount":20}]}],
 "lore":[{"id","type","name","description","visibility":"public|hidden|secret"}],
 "quests":[{"id","title","description","objectives":[{"id","description"}],"rewards":{"xp":100}}],
 "timeline":[{"id","title","date":{"year","month","day"},"description","importance","mutable":true,"hidden":false,"participants":[],"conditions":[{"type":"flag","key":"...","equals":false}]}],
 "system":{"enabled":true,"name","description","voice","modules":{"levels":true,"experience":true,"skillPoints":true,"achievements":false,"shop":false,"titles":false},"currencies":[{"id","name"}],"customMechanics":[{"id","name","rules"}]},
 "characterCreation":{"fields":[{"id":"name","label":"Имя","type":"text","required":true}, ...дополнительные поля, select с options [{"value","label","description","grants":{"abilityIds":[],"items":[{"itemId","quantity"}]}}]],"startingAbilityIds":[],"startingItems":[{"itemId","quantity"}]},
 "start":{"date":{"year","month","day","hour"},"locationId","situation","playerBackground","playerKnowledge":"none|partial|full","knownFacts":[],"playerSecrets":[{"id","description","keywords":[]}],"activeQuestIds":[],"openingScene":"первая сцена истории, 150-300 слов"},
 "rules":{"tone","narrativeStyle","responseLength":"short|medium|long","violence":"none|low|medium|high","romance":"none|low|medium|high","comedy":"none|low|medium|high","difficulty":"story|normal|hard|brutal","canonStrictness":"loose|balanced|strict","playerFreedom":"guided|open|sandbox","npcAutonomy":"none|low|medium|high","worldLethality":"none|low|medium|high","playerCanDie":false,"progressionSpeed":"slow|normal|fast","customInstructions"},
 "storyHooks":[]}`;

/**
 * A draft is built in three steps so that each model call stays small enough
 * to finish quickly (one giant JSON answer can take many minutes) and the UI
 * can show real progress. Every step sees what the previous ones produced.
 */
const DRAFT_STAGE_KEYS: Record<DraftStage, readonly string[]> = {
  world: ["metadata", "tags", "world", "calendar", "mechanics", "system", "rules", "locations"],
  cast: ["npcs", "factions", "abilities", "items", "characterCreation"],
  story: ["lore", "quests", "timeline", "start", "storyHooks"],
};

const DRAFT_STAGE_TASKS: Record<DraftStage, string> = {
  world:
    "Шаг 1 из 3. Создай основу сценария: название и описание, теги, мир (история, география, магия или технологии, политика, культура, важные правила), календарь, механики и характеристики, систему (если уместна), правила для рассказчика и тон, 4–6 локаций со связями между ними.",
  cast:
    "Шаг 2 из 3. По уже созданному миру добавь 3–6 важных персонажей с характерами, целями, страхами и тайнами (startingLocationId — id из созданных локаций), 2–3 фракции, систему сил через способности (стартовые способности героя не должны делать его всемогущим), полезные предметы и настройки создания героя.",
  story:
    "Шаг 3 из 3. По уже созданному миру и персонажам добавь лор, 2–4 квеста, 3–5 событий временной линии, стартовую ситуацию героя с первой сценой (start, locationId — из созданных локаций, activeQuestIds — из квестов) и сюжетные зацепки.",
};

/** Lines of SCENARIO_FORMAT_HINT that describe the given keys. */
function formatHintFor(keys: readonly string[]): string {
  const lines = SCENARIO_FORMAT_HINT.split("\n").slice(1);
  const picked = lines.filter((line) => keys.some((k) => line.trimStart().replace(/^\{/, "").startsWith(`"${k}"`)));
  return `Формат (JSON), верни объект только с ключами ${keys.map((k) => `"${k}"`).join(", ")}:\n${picked.join("\n")}`;
}

export interface DraftStageInput {
  idea: string;
  answers: WizardAnswer[];
  stage: DraftStage;
  /** Everything produced by the previous steps. */
  partial: Record<string, unknown>;
}

/** Runs one step of the draft and returns the partial scenario with this step's keys merged in. */
export async function generateDraftStage(ai: TextGenerator, input: DraftStageInput): Promise<Record<string, unknown>> {
  const keys = DRAFT_STAGE_KEYS[input.stage];
  const answers = input.answers.map((a) => `- ${a.question}: ${a.answer}`).join("\n");
  const soFar = Object.keys(input.partial).length ? `\n\nУже создано (не повторяй, опирайся на эти id и имена):\n${JSON.stringify(input.partial)}` : "";
  const schema = z
    .unknown()
    .refine((raw) => typeof raw === "object" && raw !== null && !Array.isArray(raw), "ожидался JSON-объект")
    .transform((raw) => raw as Record<string, unknown>);
  const res = await generateStructured(
    ai,
    {
      purpose: "scenario_draft",
      system: CREATOR_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Идея: «${input.idea}»\nВыбор автора:\n${answers || "(без уточнений)"}${soFar}\n\n${DRAFT_STAGE_TASKS[input.stage]} Герой должен быть интересным, но не всемогущим с первой минуты.\n\n${formatHintFor(keys)}\n\nОтветь ОДНИМ JSON-объектом.`,
        },
      ],
      temperature: 0.8,
      maxOutputTokens: 8000,
      mockPayload: { idea: input.idea, answers: input.answers },
    },
    schema,
    2,
  );
  const merged = { ...input.partial };
  for (const key of keys) if (res.value[key] !== undefined) merged[key] = res.value[key];
  return merged;
}

/** Turns the merged steps into a valid scenario. */
export function finishScenarioDraft(partial: Record<string, unknown>, id: string, authorName: string): Scenario {
  return sanitizeScenario(partial, id, authorName);
}

export async function generateScenarioDraft(ai: TextGenerator, input: { idea: string; answers: WizardAnswer[]; id: string; authorName: string }): Promise<Scenario> {
  let partial: Record<string, unknown> = {};
  for (const stage of DRAFT_STAGES) partial = await generateDraftStage(ai, { idea: input.idea, answers: input.answers, stage, partial });
  return finishScenarioDraft(partial, input.id, input.authorName);
}

const PATCH_HINT = `Изменения описывай операциями:
{"op":"set","path":"world.politics","value":"..."} — заменить поле (корни: metadata, tags, world, calendar, mechanics, system, characterCreation, start, rules, storyHooks);
{"op":"add","collection":"npcs|factions|locations|abilities|items|lore|quests|timeline","value":{...новый объект с уникальным id...}};
{"op":"update","collection":"...","id":"...","value":{...только изменённые поля...}};
{"op":"remove","collection":"...","id":"..."}.
Меняй ТОЛЬКО то, что относится к просьбе автора.`;

export async function proposeRevision(ai: TextGenerator, scenario: Scenario, instruction: string): Promise<ScenarioPatch> {
  const res = await generateStructured(
    ai,
    {
      purpose: "scenario_revise",
      system: CREATOR_SYSTEM,
      messages: [{ role: "user", content: `Текущий сценарий:\n${scenarioJson(scenario)}\n\nПросьба автора: «${instruction}»\n\n${PATCH_HINT}\nОтветь JSON: {"title":"кратко","summary":"что и зачем меняется","operations":[...]}` }],
      temperature: 0.6,
      maxOutputTokens: 6000,
      mockPayload: { scenario, instruction },
    },
    ScenarioPatchSchema,
  );
  return res.value;
}

const AlternativesSchema = z.object({ alternatives: z.array(ScenarioPatchSchema).min(1).max(5) });

export async function proposeAlternatives(ai: TextGenerator, scenario: Scenario, instruction: string): Promise<ScenarioPatch[]> {
  const res = await generateStructured(
    ai,
    {
      purpose: "scenario_alternatives",
      system: CREATOR_SYSTEM,
      messages: [{ role: "user", content: `Текущий сценарий:\n${scenarioJson(scenario)}\n\nАвтор: «${instruction}»\nПредложи 3 СОВЕРШЕННО РАЗНЫЕ альтернативы (не вариации одной идеи).\n\n${PATCH_HINT}\nОтветь JSON: {"alternatives":[{"title","summary","operations":[...]}]}` }],
      temperature: 0.95,
      maxOutputTokens: 8000,
      mockPayload: { scenario, instruction },
    },
    AlternativesSchema,
  );
  return res.value.alternatives;
}

export const FIELD_ACTIONS: Record<FieldAction, string> = {
  help: "Помочь с AI: предложи 3 концепции на основе пожелания автора",
  expand: "Расширь текст, сохранив замысел",
  rewrite: "Перепиши текст выразительнее",
  ideas: "Сгенерируй идеи для этого поля",
  contradictions: "Найди противоречия с остальным сценарием",
  balance: "Оцени баланс и предложи правки",
  detail: "Сделай подробнее и конкретнее",
  simplify: "Упрости, оставив суть",
  alternatives: "Предложи альтернативные варианты",
};

const FieldAssistSchema = z.object({ suggestions: z.array(z.object({ title: z.string(), text: z.string() })).min(1).max(5), note: z.string().default("") });
export type FieldAssistResult = z.infer<typeof FieldAssistSchema>;

export async function assistField(ai: TextGenerator, input: { scenario: Scenario; fieldLabel: string; value: string; action: FieldAction; wish?: string }): Promise<FieldAssistResult> {
  const res = await generateStructured(
    ai,
    {
      purpose: "field_assist",
      system: CREATOR_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Сценарий «${input.scenario.metadata.title}»: ${input.scenario.metadata.shortDescription}\nМир: ${input.scenario.world.description.slice(0, 1500)}\n\nПоле: «${input.fieldLabel}»\nТекущее значение: «${input.value || "(пусто)"}»\n${input.wish ? `Пожелание автора: «${input.wish}»\n` : ""}Задача: ${FIELD_ACTIONS[input.action]}.\nОтветь JSON: {"suggestions":[{"title":"кратко","text":"готовый текст для поля"}],"note":"комментарий, если нужен"}`,
        },
      ],
      temperature: 0.8,
      maxOutputTokens: 3000,
      mockPayload: input,
    },
    FieldAssistSchema,
  );
  return res.value;
}

const AssistantSchema = z.object({ reply: z.string(), proposals: z.array(ScenarioPatchSchema).max(3).default([]) });
export type AssistantResult = z.infer<typeof AssistantSchema>;

export async function editorAssistant(ai: TextGenerator, input: { scenario: Scenario; history: { role: "user" | "assistant"; content: string }[]; message: string }): Promise<AssistantResult> {
  const res = await generateStructured(
    ai,
    {
      purpose: "editor_assistant",
      system: `${CREATOR_SYSTEM}\nТы — постоянный помощник в редакторе. Ты видишь текущий черновик. Отвечай по делу. Если предлагаешь изменения — оформи их как proposals (автор применит их сам, ты ничего не сохраняешь).\n${PATCH_HINT}\nОтвет JSON: {"reply":"текст ответа","proposals":[{"title","summary","operations":[...]}]}`,
      messages: [
        { role: "user", content: `Текущий черновик:\n${scenarioJson(input.scenario)}` },
        { role: "assistant", content: "Черновик изучил. Чем помочь?" },
        ...input.history.slice(-8),
        { role: "user", content: input.message },
      ],
      temperature: 0.6,
      maxOutputTokens: 6000,
      mockPayload: { scenario: input.scenario, message: input.message },
    },
    AssistantSchema,
  );
  return res.value;
}

const ReviewSchema = z.object({
  issues: z.array(z.object({ level: z.enum(["error", "warning", "suggestion"]).default("suggestion"), message: z.string(), section: z.string().default("general") })).default([]),
});
export type AIReview = z.infer<typeof ReviewSchema>;

export async function reviewScenario(ai: TextGenerator, scenarioToReview: Scenario): Promise<AIReview> {
  const res = await generateStructured(
    ai,
    {
      purpose: "scenario_review",
      system: CREATOR_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Проверь сценарий перед публикацией: противоречия, незаполненные критические части, баланс, непонятные правила, потенциальные проблемы для рассказчика. Технические ссылки уже проверены программой — сосредоточься на смысле.\n${scenarioJson(scenarioToReview)}\nОтвет JSON: {"issues":[{"level":"warning|suggestion","message":"...","section":"world|npcs|system|rules|..."}]}`,
        },
      ],
      temperature: 0.3,
      maxOutputTokens: 3000,
      mockPayload: { scenario: scenarioToReview },
    },
    ReviewSchema,
  );
  return res.value;
}

const CharactersSchema = z.object({
  characters: z.array(z.object({ name: z.string(), summary: z.string().default(""), fields: z.record(z.string(), z.string()).default({}) })).min(1).max(5),
});
export type GeneratedCharacters = z.infer<typeof CharactersSchema>;

export async function generateCharacters(ai: TextGenerator, input: { scenario: Scenario; request: string }): Promise<GeneratedCharacters> {
  const fields = input.scenario.characterCreation.fields
    .map((f) => `- ${f.id} (${f.label})${f.options.length ? `: одно из ${f.options.map((o) => o.value).join(", ")}` : ""}${f.aiHint ? ` — ${f.aiHint}` : ""}`)
    .join("\n");
  const res = await generateStructured(
    ai,
    {
      purpose: "character",
      system: CREATOR_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Сценарий «${input.scenario.metadata.title}»: ${input.scenario.metadata.shortDescription}\nСтарт: ${input.scenario.start.situation}\nПоля персонажа:\n${fields}\n\nПросьба игрока: «${input.request || "Сделай мне интересного персонажа"}»\nПредложи 3 разных персонажа. Ответ JSON: {"characters":[{"name","summary","fields":{"id_поля":"значение"}}]}`,
        },
      ],
      temperature: 0.95,
      maxOutputTokens: 3000,
      mockPayload: input,
    },
    CharactersSchema,
  );
  return res.value;
}

