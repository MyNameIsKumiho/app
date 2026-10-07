import { describe, expect, it } from "vitest";
import { createAetherfallAcademy } from "../src/demo/aetherfallAcademy";
import { createGameState } from "../src/scenario/createGame";
import { finalizeTurn, prepareTurn } from "../src/engine/turn";
import { TurnResultSchema, type TurnResult } from "../src/domain/turnResult";
import type { PlayerAction } from "../src/domain/actions";
import { detectSecretLeaks } from "../src/engine/secretGuard";
import { describeRelationship } from "../src/engine/relationships";
import { timelineView } from "../src/engine/timeline";

const scenario = createAetherfallAcademy();
const newGame = () => createGameState(scenario, { name: "Рен", fields: { affinity: "life" }, attributeAllocation: { intellect: 2 } });
const result = (partial: Partial<TurnResult> = {}): TurnResult => TurnResultSchema.parse({ narrative: "…", ...partial });
const play = (state: ReturnType<typeof newGame>, action: PlayerAction, r: Partial<TurnResult> = {}) => {
  const prepared = prepareTurn(state, scenario, action);
  return { prepared, ...finalizeTurn(prepared, scenario, result(r)) };
};

describe("createGameState", () => {
  it("applies starting abilities, grants, items and quests", () => {
    const s = newGame();
    expect(s.player.abilities.map((a) => a.abilityId)).toEqual(expect.arrayContaining(["mana-bolt", "analyze", "minor-heal"]));
    expect(s.player.inventory.find((i) => i.itemId === "healing-salve")?.quantity).toBe(1);
    expect(s.player.stats.intellect).toBe(14);
    expect(s.player.equipment.weapon).toBe("novice-wand");
    expect(s.quests["entrance-trial"]?.status).toBe("active");
    expect(s.memory.currentScene.presentNpcIds).toEqual(expect.arrayContaining(["lira", "aldric"]));
    expect(s.player.knowledge.length).toBe(2);
  });

  it("rejects invalid characters", () => {
    expect(() => createGameState(scenario, { name: "X", fields: {} })).toThrow(/Склонность/);
    expect(() => createGameState(scenario, { name: "X", fields: { affinity: "life" }, attributeAllocation: { will: 9 } })).toThrow(/очков/);
  });
});

describe("player actions", () => {
  it("abilities cost energy and go on cooldown; engine blocks unaffordable use", () => {
    const s0 = newGame();
    const t1 = play(s0, { parts: [{ kind: "ability", abilityId: "mana-bolt", target: "манекен" }] });
    expect(t1.state.player.resources.energy?.current).toBe(50);
    expect(s0.player.resources.energy?.current).toBe(60); // original untouched
    let s = t1.state;
    for (let i = 0; i < 5; i++) s = play(s, { parts: [{ kind: "ability", abilityId: "mana-bolt" }] }).state;
    expect(s.player.resources.energy?.current).toBe(0);
    const fail = play(s, { parts: [{ kind: "ability", abilityId: "mana-bolt" }] });
    expect(fail.prepared.resolved.failures[0]).toMatch(/не хватает/);
  });

  it("consumables are used up and apply effects; combined actions work", () => {
    let s = play(newGame(), { parts: [{ kind: "ability", abilityId: "mana-bolt" }] }).state;
    const t = play(s, { parts: [{ kind: "silent" }, { kind: "item", itemId: "mana-potion", mode: "use" }] });
    s = t.state;
    expect(s.player.resources.energy?.current).toBe(60);
    expect(s.player.inventory.find((i) => i.itemId === "mana-potion")).toBeUndefined();
    expect(t.prepared.resolved.summary).toContain("Молчит");
  });

  it("travel takes route time and moves the hero", () => {
    const t = play(newGame(), { parts: [{ kind: "travel", locationId: "library" }] });
    expect(t.state.player.locationId).toBe("library");
    expect(t.state.clock - newGame().clock).toBe(15);
    expect(t.sceneEnded).toBe(true);
    const hidden = play(newGame(), { parts: [{ kind: "travel", locationId: "sealed-archive" }] });
    expect(hidden.prepared.resolved.failures[0]).toMatch(/дороги/);
  });
});

describe("AI change validation", () => {
  it("applies valid and rejects invalid changes", () => {
    const t = play(newGame(), { parts: [{ kind: "say", text: "Привет" }] }, {
      stateChanges: [
        { type: "item_add", itemId: "unknown-sword", quantity: 1, reason: "" },
        { type: "item_add", itemId: "stick", name: "Палка", quantity: 1, reason: "" },
        { type: "xp", amount: 9999, reason: "" },
        { type: "ability_learn", abilityId: "flicker-step", reason: "" },
        { type: "ability_learn", abilityId: "nonexistent", reason: "" },
        { type: "player_death", reason: "test" },
      ],
      relationshipChanges: [
        { npcId: "lira", axis: "trust", delta: 90, reason: "" },
        { npcId: "ghost", axis: "trust", delta: 5, reason: "" },
      ],
      npcUpdates: [{ npcId: "kael", alive: false }],
    });
    const rejectedKinds = t.report.rejected.map((r) => r.kind);
    expect(rejectedKinds).toEqual(expect.arrayContaining(["item_add", "ability_learn", "player_death", "relationship"]));
    expect(t.state.player.inventory.some((i) => i.itemId.startsWith("custom-"))).toBe(true);
    expect(t.state.npcs.lira?.relationship.trust).toBe(20); // capped per turn
    expect(t.state.player.level).toBeGreaterThan(1); // 200 xp capped -> level 2
    expect(t.state.player.alive).toBe(true);

    const revive = play(t.state, { parts: [{ kind: "do", text: "x" }] }, { npcUpdates: [{ npcId: "kael", alive: true }] });
    expect(revive.report.rejected[0]?.reason).toMatch(/мёртвые/);
  });

  it("thoughts never reveal secrets to NPCs", () => {
    const think = play(newGame(), { parts: [{ kind: "think", text: "Я ведь из другого мира" }] }, {
      knowledgeChanges: [{ npcId: "lira", secretId: "otherworlder", source: "player_told" }],
    });
    expect(think.report.rejected[0]?.reason).toMatch(/думал/);
    expect(think.state.npcs.lira?.knownSecretIds).toEqual([]);

    const told = play(newGame(), { parts: [{ kind: "say", text: "Лира, я из другого мира." }] }, {
      knowledgeChanges: [{ npcId: "lira", secretId: "otherworlder", source: "player_told" }],
    });
    expect(told.state.npcs.lira?.knownSecretIds).toEqual(["otherworlder"]);
  });

  it("NPC memories only for present NPCs and without unknown secrets", () => {
    const t = play(newGame(), { parts: [{ kind: "do", text: "кланяюсь" }] }, {
      newMemories: [
        { owner: "lira", event: "Новенький поклонился", importance: 20, emotionalImpact: 5, participants: [] },
        { owner: "sefa", event: "Видела поклон", importance: 20, emotionalImpact: 0, participants: [] },
        { owner: "aldric", event: "Новенький — попаданец", importance: 90, emotionalImpact: 0, participants: [] },
      ],
    });
    expect(t.state.npcs.lira?.memories).toHaveLength(1);
    expect(t.report.rejected.map((r) => r.reason).join(" ")).toMatch(/не присутствовал/);
    expect(t.report.rejected.map((r) => r.reason).join(" ")).toMatch(/секрет/);
  });

  it("quest completion grants rewards", () => {
    const t = play(newGame(), { parts: [{ kind: "do", text: "сражаюсь" }] }, {
      questChanges: [
        { questId: "entrance-trial", action: "complete_objective", objectiveId: "attend-ceremony", note: "" },
        { questId: "entrance-trial", action: "complete_objective", objectiveId: "pass-trial", note: "" },
      ],
    });
    expect(t.state.quests["entrance-trial"]?.status).toBe("completed");
    expect(t.state.player.currency.crowns).toBe(70);
    expect(t.report.completedQuestIds).toEqual(["entrance-trial"]);
  });
});

describe("timeline and divergence", () => {
  it("events happen when due; player actions can cancel mutable events", () => {
    let s = newGame();
    // Secure the archive, then sleep past day 7.
    s = play(s, { parts: [{ kind: "do", text: "запечатываю архив" }] }, { worldChanges: [{ description: "Архив запечатан героем", importance: 70, flag: { key: "archive_secured", value: true } }] }).state;
    for (let i = 0; i < 8; i++) s = play(s, { parts: [{ kind: "rest", activity: "sleep", minutes: 60 * 24 }] }).state;
    const view = timelineView(s, scenario);
    expect(view.find((v) => v.event.id === "sorting-ceremony")?.status).toBe("occurred");
    expect(view.find((v) => v.event.id === "library-incident")?.status).toBe("cancelled");
    expect(s.divergences.some((d) => d.eventId === "library-incident")).toBe(true);
    expect(s.flags.sefa_injured).toBeUndefined();
  });

  it("fixed events cannot be cancelled by the AI", () => {
    const t = play(newGame(), { parts: [{ kind: "do", text: "x" }] }, { timelineChanges: [{ eventId: "sorting-ceremony", action: "cancel", note: "нет" }] });
    expect(t.report.rejected[0]?.reason).toMatch(/зафиксировано/);
  });
});

describe("secret guard and relationship labels", () => {
  it("detects an NPC voicing an unknown secret", () => {
    const s = newGame();
    const leaks = detectSecretLeaks(s, "Лира прищурилась.\n— Ты ведь из другого мира, да?", ["lira"], "");
    expect(leaks[0]?.secretId).toBe("otherworlder");
    expect(detectSecretLeaks(s, "— Ты ведь из другого мира, да?", ["lira"], "я из другого мира")).toHaveLength(0);
  });

  it("shows labels instead of numbers and hides hidden axes", () => {
    const s = newGame();
    const view = describeRelationship(scenario, s.npcs.lira!);
    expect(view.find((v) => v.axisId === "trust")?.level).toBe("Нейтральное");
    expect(view.some((v) => v.axisId === "romantic_interest")).toBe(false);
  });
});
