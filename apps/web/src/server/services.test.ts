import { describe, expect, it } from "vitest";
import { AIRouter, MockImageProvider, MockProvider, type AIProvider } from "@aetherfall/core/server";
import { createMemoryDb } from "./db/client";
import { createScenario, loadScenario, exportScenarioFile, getScenarioDetail, importScenarioFile, listScenarios, publishScenario, remix, seedBuiltins, updateScenario } from "./scenarios";
import { readSettings, writeSettings } from "./settings";
import { addNote, createManualSave, createStory, getStoryDetail, illustrateTurn, listSaves, loadSave, playStoryTurn, rewindStory, type StoryDeps } from "./stories";
import { runCreator } from "./creator";

function setup(): StoryDeps {
  const db = createMemoryDb();
  seedBuiltins(db);
  const ai = new AIRouter(new Map<string, AIProvider>([["mock", new MockProvider()]]), { primary: "mock", fallback: "disabled", autoOrder: ["mock"] });
  return { db, ai, images: new MockImageProvider(), settings: readSettings(db) };
}

const hero = { name: "Рен", fields: { affinity: "arcane" } };

describe("stories", () => {
  it("plays turns, rewinds and restores saves with the exact state", async () => {
    const deps = setup();
    const { id } = createStory(deps.db, { scenarioId: "aetherfall-academy", character: hero });
    const opening = getStoryDetail(deps.db, id, deps.settings);
    expect(opening.turns).toHaveLength(1);
    expect(opening.view.player.name).toBe("Рен");

    const t1 = await playStoryTurn(deps, id, { parts: [{ kind: "say", text: "Привет, где церемония?" }] });
    expect(t1.turn.number).toBe(1);
    createManualSave(deps.db, id, { slot: 1, label: "До второго хода" });
    await playStoryTurn(deps, id, { parts: [{ kind: "do", text: "Иду посетить церемонию распределения" }] });
    const afterTwo = getStoryDetail(deps.db, id, deps.settings);
    expect(afterTwo.turns.map((t) => t.number)).toEqual([0, 1, 2]);

    // Rewind to turn 1 and branch.
    rewindStory(deps.db, id, t1.turn.id);
    const rewound = getStoryDetail(deps.db, id, deps.settings);
    expect(rewound.turns.map((t) => t.number)).toEqual([0, 1]);
    expect(rewound.view.turn).toBe(1);
    await playStoryTurn(deps, id, { parts: [{ kind: "think", text: "Странное место" }] });
    expect(getStoryDetail(deps.db, id, deps.settings).turns).toHaveLength(3);

    // Notes survive loading a save.
    addNote(deps.db, id, "Альдрик подозрителен");
    const manual = listSaves(deps.db, id).find((s) => s.kind === "manual")!;
    loadSave(deps.db, id, manual.id);
    const loaded = getStoryDetail(deps.db, id, deps.settings);
    expect(loaded.view.turn).toBe(1);
    expect(loaded.view.notes.map((n) => n.text)).toEqual(["Альдрик подозрителен"]);
    expect(listSaves(deps.db, id).filter((s) => s.kind === "auto").length).toBeGreaterThan(0);
  });

  it("never sends hidden data to the player view", async () => {
    const deps = setup();
    const { id } = createStory(deps.db, { scenarioId: "aetherfall-academy", character: hero });
    const detail = getStoryDetail(deps.db, id, deps.settings);
    const json = JSON.stringify(detail);
    expect(json).not.toContain("агент Пепельного Круга"); // Aldric's secret
    expect(json).not.toContain("Симпатия"); // hidden relationship axis
    for (const rel of detail.view.relationships) for (const axis of rel.axes) expect(Object.keys(axis)).toEqual(["label", "level"]);
  });

  it("rejects invalid actions and stores manual illustrations", async () => {
    const deps = setup();
    const { id } = createStory(deps.db, { scenarioId: "aetherfall-academy", character: hero });
    await expect(playStoryTurn(deps, id, { parts: [] })).rejects.toThrow();
    const detail = getStoryDetail(deps.db, id, deps.settings);
    const { imageId } = await illustrateTurn(deps, id, detail.turns[0]!.id);
    expect(getStoryDetail(deps.db, id, deps.settings).turns[0]!.imageId).toBe(imageId);
  });

  it("keeps old stories playable after the scenario is edited", async () => {
    const deps = setup();
    const card = createScenario(deps.db, { title: "Мой мир", authorName: "Игрок" });
    const { id } = createStory(deps.db, { scenarioId: card.id, character: { name: "Ая" } });
    const detail = getScenarioDetail(deps.db, card.id);
    updateScenario(deps.db, card.id, { ...detail.scenario!, locations: [{ id: "start", name: "Переименованная локация" }] });
    const story = getStoryDetail(deps.db, id, deps.settings);
    expect(story.view.location.name).toBe("Начальная локация");
  });
});

describe("scenarios", () => {
  it("lists, publishes with version bump, remixes and round-trips files", () => {
    const { db } = setup();
    expect(listScenarios(db, { scope: "explore" }).map((c) => c.id)).toContain("aetherfall-academy");
    const card = createScenario(db, { title: "Тест", authorName: "Игрок" });
    expect(publishScenario(db, card.id, { visibility: "published" }).card.version).toBe("1.0.0");
    expect(publishScenario(db, card.id, { visibility: "published" }).card.version).toBe("1.1.0");
    expect(() => updateScenario(db, "aetherfall-academy", {})).toThrow(/ремикс/);
    const copy = remix(db, "aetherfall-academy", { authorName: "Игрок" });
    expect(copy.basedOn?.author).toBe("Aetherfall Team");
    const file = exportScenarioFile(db, copy.id);
    const imported = importScenarioFile(db, file.content, "Игрок");
    expect(imported.id).not.toBe(copy.id);
    expect(listScenarios(db, { scope: "library", tag: "академия" }).length).toBeGreaterThanOrEqual(0);
  });

  it("merges settings updates", () => {
    const { db } = setup();
    writeSettings(db, { ai: { primary: "claude" } });
    const s = writeSettings(db, { images: { mode: "important" } });
    expect(s.ai.primary).toBe("claude");
    expect(s.ai.temperature).toBe(0.8);
    expect(() => writeSettings(db, { ai: { temperature: 5 } })).toThrow();
  });

  it("creator returns proposals without saving them", async () => {
    const deps = setup();
    const detail = { scenario: loadScenario(deps.db, "aetherfall-academy") };
    const load = (id: string) => loadScenario(deps.db, id);
    const before = listScenarios(deps.db, { scope: "mine" }).length;
    const res = (await runCreator(deps.ai, { op: "revise", scenario: detail.scenario, instruction: "Добавь больше политики" }, load)) as { patch: unknown };
    expect(res.patch).toBeTruthy();
    const applied = (await runCreator(deps.ai, { op: "apply_patch", scenario: detail.scenario, patch: res.patch }, load)) as { scenario: { factions: unknown[] } };
    expect(applied.scenario.factions.length).toBe(detail.scenario.factions.length + 1);
    expect(listScenarios(deps.db, { scope: "mine" }).length).toBe(before);
    const chars = (await runCreator(deps.ai, { op: "characters", scenarioId: "aetherfall-academy", request: "" }, load)) as { characters: unknown[] };
    expect(chars.characters).toHaveLength(3);
    expect(getScenarioDetail(deps.db, "aetherfall-academy").scenario).toBeNull();
  });
});
