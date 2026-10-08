import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AIError,
  AIRouter,
  MockProvider,
  analyzeIdea,
  applyPatch,
  buildStoryContext,
  compactMemory,
  createAetherfallAcademy,
  createGameState,
  editorAssistant,
  exportScenario,
  extractiveSummarizer,
  generateCharacters,
  generateScenarioDraft,
  generateStructured,
  parseStructured,
  playTurn,
  prepareTurn,
  proposeAlternatives,
  proposeRevision,
  readScenarioPackage,
  remixScenario,
  repairJson,
  ScenarioSchema,
  validateScenario,
  type AIProvider,
  type TextRequest,
} from "../src/server";

const scenario = createAetherfallAcademy();
const newGame = () => createGameState(scenario, { name: "Рен", fields: { affinity: "arcane" } });

class ScriptedProvider implements AIProvider {
  readonly kind = "api" as const;
  calls = 0;
  last?: TextRequest;
  constructor(readonly id: string, private readonly replies: (string | AIError)[]) {}
  get label() {
    return this.id;
  }
  async status() {
    return { id: this.id, label: this.id, kind: this.kind, available: true, detail: "" };
  }
  async generateText(req: TextRequest) {
    this.last = req;
    const reply = this.replies[Math.min(this.calls, this.replies.length - 1)];
    this.calls += 1;
    if (reply instanceof AIError) throw reply;
    return { text: reply ?? "", providerId: this.id, model: "scripted" };
  }
}

describe("structured output", () => {
  it("extracts and repairs sloppy JSON", () => {
    const schema = z.object({ a: z.number(), b: z.array(z.string()) });
    expect(parseStructured('Конечно! ```json\n{"a": 1, "b": ["x",],}\n```', schema)).toEqual({ ok: true, value: { a: 1, b: ["x"] } });
    expect(repairJson('{"a": 1, "b": ["x"')).toBe('{"a": 1, "b": ["x"]}');
    expect(parseStructured("нет json", schema).ok).toBe(false);
  });

  it("retries with the validation error and then succeeds", async () => {
    const provider = new ScriptedProvider("p", ['{"a":"oops"}', '{"a": 2}']);
    const res = await generateStructured(provider, { purpose: "summarize", system: "", messages: [{ role: "user", content: "x" }] }, z.object({ a: z.number() }));
    expect(res.value.a).toBe(2);
    expect(res.attempts).toBe(2);
  });

  it("fails gracefully after max attempts", async () => {
    const provider = new ScriptedProvider("p", ["garbage"]);
    await expect(generateStructured(provider, { purpose: "summarize", system: "", messages: [] }, z.object({ a: z.number() }), 2)).rejects.toMatchObject({ code: "invalid_output" });
  });
});

describe("AI router", () => {
  it("falls back on rate limit and records events", async () => {
    const primary = new ScriptedProvider("claude", [new AIError("rate_limit", "429")]);
    const fallback = new ScriptedProvider("openai", ["ok"]);
    const router = new AIRouter(new Map<string, AIProvider>([["claude", primary], ["openai", fallback]]), { primary: "claude", fallback: "openai", autoOrder: [] });
    const res = await router.generateText({ purpose: "summarize", system: "", messages: [] });
    expect(res.providerId).toBe("openai");
    expect(router.events.map((e) => e.ok)).toEqual([false, true]);
  });

  it("does not fall back on invalid requests and respects 'disabled'", async () => {
    const primary = new ScriptedProvider("claude", [new AIError("invalid_request", "bad")]);
    const fallback = new ScriptedProvider("openai", ["ok"]);
    const providers = new Map<string, AIProvider>([["claude", primary], ["openai", fallback]]);
    await expect(new AIRouter(providers, { primary: "claude", fallback: "openai", autoOrder: [] }).generateText({ purpose: "summarize", system: "", messages: [] })).rejects.toMatchObject({ code: "invalid_request" });
    const quota = new ScriptedProvider("claude", [new AIError("quota", "no money")]);
    await expect(new AIRouter(new Map<string, AIProvider>([["claude", quota], ["openai", fallback]]), { primary: "claude", fallback: "disabled", autoOrder: [] }).generateText({ purpose: "summarize", system: "", messages: [] })).rejects.toMatchObject({ code: "quota" });
  });

  it("passes the player's speed and per-provider model to each provider", async () => {
    const claude = new ScriptedProvider("claude", [new AIError("rate_limit", "429")]);
    const openai = new ScriptedProvider("openai", ["ok"]);
    const router = new AIRouter(new Map<string, AIProvider>([["claude", claude], ["openai", openai]]), {
      primary: "claude",
      fallback: "openai",
      autoOrder: [],
      speed: "fast",
      models: { claude: "my-claude", openai: "" },
    });
    await router.generateText({ purpose: "summarize", system: "", messages: [] });
    expect(claude.last).toMatchObject({ speed: "fast", model: "my-claude" });
    expect(openai.last?.speed).toBe("fast");
    expect(openai.last?.model).toBeUndefined();
  });

  it("auto mode prefers real providers over the mock", async () => {
    const mock = new MockProvider();
    const real = new ScriptedProvider("openai", ["x"]);
    const router = new AIRouter(new Map<string, AIProvider>([["mock", mock], ["openai", real]]), { primary: "auto", fallback: "disabled", autoOrder: ["claude", "openai", "mock"] });
    expect((await router.plan()).map((p) => p.id)).toEqual(["openai"]);
  });
});

describe("full turn with mock storyteller", () => {
  const router = new AIRouter(new Map<string, AIProvider>([["mock", new MockProvider()]]), { primary: "mock", fallback: "disabled", autoOrder: ["mock"] });

  it("plays turns end-to-end and keeps state consistent", async () => {
    let state = newGame();
    const t1 = await playTurn(router, scenario, state, { parts: [{ kind: "say", text: "Привет, я тут новенький. Где церемония?" }] });
    expect(t1.narrative.length).toBeGreaterThan(50);
    expect(t1.suggestedActions.length).toBeGreaterThanOrEqual(3);
    expect(t1.state.npcs.lira?.memories.length).toBe(1);
    expect(t1.state.turn).toBe(1);
    state = t1.state;
    for (let i = 0; i < 12; i++) {
      state = (await playTurn(router, scenario, state, { parts: [{ kind: "do", text: `осматриваю зал, шаг ${i}` }] })).state;
    }
    expect(state.memory.recent.length).toBeLessThanOrEqual(8);
    expect(state.memory.sceneSummaries.length).toBeGreaterThan(0);
  });

  it("quest objectives progress from matching free actions", async () => {
    const t = await playTurn(router, scenario, newGame(), { parts: [{ kind: "do", text: "Иду посетить церемонию распределения" }] });
    expect(t.state.quests["entrance-trial"]?.objectives["attend-ceremony"]).toBe(true);
  });
});

describe("context engine", () => {
  it("stays within budget, keeps required sections and warns about unknown secrets", () => {
    const state = newGame();
    const prepared = prepareTurn(state, scenario, { parts: [{ kind: "say", text: "Привет" }] });
    const ctx = buildStoryContext({ scenario, state: prepared.draft, resolved: prepared.resolved, budgetTokens: 1500 });
    expect(ctx.user).toContain("НЕ ЗНАЕТ");
    expect(ctx.user).toContain("Действие игрока");
    expect(ctx.sections.find((s) => s.name === "Присутствуют")?.included).toBe(true);
    expect(ctx.sections.some((s) => !s.included)).toBe(true);
    const big = buildStoryContext({ scenario, state: prepared.draft, resolved: prepared.resolved, budgetTokens: 20000 });
    expect(big.sections.every((s) => s.included)).toBe(true);
  });
});

describe("memory engine", () => {
  it("never drops permanent facts when compacting", async () => {
    const state = newGame();
    for (let i = 0; i < 120; i++) {
      state.memory.longTerm.push({ id: `m${i}`, event: `событие ${i}`, importance: i === 5 ? 95 : 10, emotionalImpact: 0, timestamp: 0, turn: i, participants: [] });
    }
    await compactMemory(state, extractiveSummarizer, { overflow: [], newArcTitle: "Новая арка" });
    expect(state.memory.longTerm.length).toBeLessThanOrEqual(80);
    expect(state.memory.longTerm.some((m) => m.id === "m5")).toBe(true);
    expect(state.memory.currentArc.title).toBe("Новая арка");
  });
});

describe("scenario creator (mock)", () => {
  const router = new AIRouter(new Map<string, AIProvider>([["mock", new MockProvider()]]), { primary: "mock", fallback: "disabled", autoOrder: ["mock"] });
  const idea = "Я переродился младшим братом главного злодея в магической академии и получил систему, позволяющую воровать способности";

  it("asks questions, then builds a playable draft", async () => {
    const analysis = await analyzeIdea(router, idea);
    expect(analysis.questions.length).toBeGreaterThanOrEqual(3);
    const answers = analysis.questions.map((q) => ({ questionId: q.id, question: q.question, answer: q.options[0]?.label ?? "" }));
    const draft = await generateScenarioDraft(router, { idea, answers, id: "scn-1", authorName: "Тест" });
    expect(draft.system.enabled).toBe(true);
    expect(draft.npcs.length).toBeGreaterThanOrEqual(3);
    expect(draft.abilities.some((a) => a.category === "forbidden")).toBe(true);
    const report = validateScenario(draft);
    expect(report.canPlay).toBe(true);
    // The draft can actually be played.
    const state = createGameState(draft, { name: "Лео", fields: {} });
    const turn = await playTurn(router, draft, state, { parts: [{ kind: "do", text: "Осмотреться" }] });
    expect(turn.state.turn).toBe(1);
  });

  it("revisions are patches applied only on confirmation", async () => {
    const before = createAetherfallAcademy();
    const patch = await proposeRevision(router, before, "Добавь больше политики");
    expect(before.factions.length).toBe(3); // nothing applied yet
    const applied = applyPatch(before, patch);
    expect(applied.ok && applied.scenario.factions.length).toBe(4);
    const alternatives = await proposeAlternatives(router, before, "Не нравится система");
    expect(alternatives).toHaveLength(3);
    const assistant = await editorAssistant(router, { scenario: before, history: [], message: "Добавь организацию магов" });
    expect(assistant.proposals[0]?.operations[0]).toMatchObject({ op: "add", collection: "factions" });
  });

  it("generates characters that fit the scenario's fields", async () => {
    const res = await generateCharacters(router, { scenario, request: "Сделай мне интересного персонажа" });
    expect(res.characters).toHaveLength(3);
    for (const c of res.characters) expect(["arcane", "life", "motion"]).toContain(c.fields.affinity);
  });
});

describe("scenario packages", () => {
  it("round-trips export/import and remixes with attribution", () => {
    const pkg = exportScenario(scenario);
    const imported = ScenarioSchema.parse(readScenarioPackage(pkg));
    expect(imported).toEqual(scenario);
    expect(() => readScenarioPackage("{}")).toThrow();
    const remix = remixScenario(scenario, { newId: "remix-1", title: "Aetherfall — Hardcore Edition", authorName: "Игрок" });
    expect(remix.metadata.originalScenarioId).toBe("aetherfall-academy");
    expect(remix.metadata.originalAuthor).toBe("Aetherfall Team");
  });

  it("demo scenario passes validation without errors", () => {
    const report = validateScenario(scenario);
    expect(report.issues.filter((i) => i.level === "error")).toEqual([]);
  });
});
