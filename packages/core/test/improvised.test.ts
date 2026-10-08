import { describe, expect, it } from "vitest";
import { createAetherfallAcademy } from "../src/demo/aetherfallAcademy";
import { createGameState } from "../src/scenario/createGame";
import { finalizeTurn, prepareTurn } from "../src/engine/turn";
import { TurnResultSchema, type TurnResult } from "../src/domain/turnResult";
import type { PlayerAction } from "../src/domain/actions";
import type { GameState } from "../src/domain/gameState";
import { withImprovised } from "../src/engine/improvised";
import { presentNpcIds } from "../src/engine/world";

const authored = createAetherfallAcademy();
const newGame = () => createGameState(authored, { name: "Рен", fields: { affinity: "life" } });
const play = (state: GameState, action: PlayerAction, r: Partial<TurnResult> = {}) => {
  const scenario = withImprovised(authored, state);
  const prepared = prepareTurn(state, scenario, action);
  return { prepared, ...finalizeTurn(prepared, scenario, TurnResultSchema.parse({ narrative: "…", ...r })) };
};

describe("improvised places and characters", () => {
  it("moving to a place the scenario lacks creates it and updates «Сейчас»", () => {
    const t = play(newGame(), { parts: [{ kind: "do", text: "Иду на вокзал" }] }, {
      stateChanges: [{ type: "move", name: "Вокзал", description: "Шумный вокзал у академии" }],
    });
    expect(t.state.customLocations.map((l) => l.name)).toEqual(["Вокзал"]);
    expect(t.state.player.locationId).toBe(t.state.customLocations[0]!.id);
    // A second visit reuses the same place by name.
    const back = play(t.state, { parts: [{ kind: "do", text: "Снова на вокзал" }] }, { stateChanges: [{ type: "move", locationId: "Вокзал" }] });
    expect(back.state.customLocations).toHaveLength(1);
    expect(authored.locations.some((l) => l.name === "Вокзал")).toBe(false);
  });

  it("sceneChange.locationId alone also moves the hero", () => {
    const s = newGame();
    const other = authored.locations.find((l) => l.id !== s.player.locationId)!;
    const t = play(s, { parts: [{ kind: "do", text: "Иду дальше" }] }, { sceneChange: { title: "Дальше", locationId: other.id } });
    expect(t.state.player.locationId).toBe(other.id);
  });

  it("new characters the AI introduces appear in «Рядом»", () => {
    const t = play(newGame(), { parts: [{ kind: "do", text: "Оглядываюсь" }] }, {
      npcUpdates: [{ name: "Кондуктор Марта", description: "Строгая женщина в форме", present: true }],
    });
    const npc = t.state.customNpcs.find((n) => n.name === "Кондуктор Марта");
    expect(npc).toBeDefined();
    expect(presentNpcIds(t.state)).toContain(npc!.id);
  });
});

describe("auto-equip", () => {
  it("taking out an item in the action text puts it into equipment", () => {
    const s = newGame();
    s.player.equipment = {};
    const t = play(s, { parts: [{ kind: "do", text: "Достаю палочку и осматриваюсь" }] });
    expect(Object.values(t.state.player.equipment)).toContain("novice-wand");
    expect(t.prepared.resolved.outcomes.join(" ")).toMatch(/Экипировано/);
  });

  it("improvised items without a slot go into the hands", () => {
    const t1 = play(newGame(), { parts: [{ kind: "do", text: "Покупаю атлас" }] }, {
      stateChanges: [{ type: "item_add", itemId: "atlas", name: "Атлас звёзд", description: "Карта неба" }],
    });
    const t2 = play(t1.state, { parts: [{ kind: "do", text: "Достал атлас звёзд" }] });
    expect(t2.state.player.equipment.held).toBeDefined();
  });
});
