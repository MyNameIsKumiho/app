import type { GameState } from "../domain/gameState";
import type { Scenario } from "../domain/scenario";
import { findItem, itemQuantity } from "./mutations";

/** Slots for things the hero simply holds: a wand, an atlas, a torch. */
export const HELD_SLOT = "held";
export const HELD_SLOT_2 = "held2";

export type EquipResult = { ok: true; name: string; slot: string } | { ok: false; reason: string };

/** Puts an owned item into its slot (or into the hands when it has none). */
export function equipItem(state: GameState, scenario: Scenario, itemRef: string, slot?: string): EquipResult {
  const lower = itemRef.trim().toLowerCase();
  const owned = state.player.inventory.map((e) => findItem(scenario, e.itemId, state)).filter((i) => i !== undefined);
  const item = findItem(scenario, itemRef, state) ?? owned.find((i) => i.name.toLowerCase() === lower);
  if (!item || itemQuantity(state, item.id) === 0) return { ok: false, reason: "у героя нет этого предмета" };
  let target = slot?.trim() || item.slot || HELD_SLOT;
  if (Object.values(state.player.equipment).includes(item.id) && !slot) {
    const current = Object.entries(state.player.equipment).find(([, id]) => id === item.id)?.[0] ?? target;
    return { ok: true, name: item.name, slot: current };
  }
  // Two free hands: the second held item goes into the other hand.
  if (target === HELD_SLOT && state.player.equipment[HELD_SLOT] && !state.player.equipment[HELD_SLOT_2]) target = HELD_SLOT_2;
  for (const [s, id] of Object.entries(state.player.equipment)) if (id === item.id) delete state.player.equipment[s];
  state.player.equipment[target] = item.id;
  return { ok: true, name: item.name, slot: target };
}

export function unequipItem(state: GameState, scenario: Scenario, itemRef: string): string | null {
  const item = findItem(scenario, itemRef, state);
  let removed = false;
  for (const [slot, id] of Object.entries(state.player.equipment)) {
    if (id === itemRef || id === item?.id) {
      delete state.player.equipment[slot];
      removed = true;
    }
  }
  return removed ? (item?.name ?? itemRef) : null;
}

const TAKE_OUT = /(доста(л|ю|ет|ла|ём|ем)|вынима|выну(л|ла)|взял|взяла|беру|бер[её]т|хвата|схвати|надева|наде(л|ла|ну)|вооружа|сжима|поднима[юе]|подня(л|ла))/i;

/**
 * Items the hero takes out or puts on in the action text ("достаю палочку",
 * "надеваю плащ") go straight into equipment. Matches by the item name's stem.
 */
export function equipFromText(state: GameState, scenario: Scenario, text: string): string[] {
  if (!TAKE_OUT.test(text)) return [];
  const lower = text.toLowerCase().replace(/ё/g, "е");
  const equipped: string[] = [];
  for (const entry of state.player.inventory) {
    const item = findItem(scenario, entry.itemId, state);
    if (!item) continue;
    const words = item.name.toLowerCase().replace(/ё/g, "е").split(/[^\p{L}]+/u).filter((w) => w.length >= 4);
    const stems = words.map((w) => w.slice(0, Math.max(4, w.length - 2)));
    if (stems.length > 0 && stems.some((stem) => lower.includes(stem))) {
      const res = equipItem(state, scenario, item.id);
      if (res.ok) equipped.push(res.name);
    }
  }
  return equipped;
}
