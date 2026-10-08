import { emotionLabel, intensityLabel, type ActionPart, type PlayerAction } from "../domain/actions";
import type { GameState } from "../domain/gameState";
import type { Ability, Scenario } from "../domain/scenario";
import { formatDuration } from "../domain/time";
import { grantXp } from "./progression";
import { addItem, applyEffect, changeResource, effectiveStats, findItem, itemQuantity, removeItem } from "./mutations";
import { equipFromText, equipItem } from "./equipment";
import { statedDurationMinutes } from "./statedTime";
import { findRoute, markVisited } from "./world";

/**
 * Resolves the mechanical side of a player action BEFORE the AI sees it:
 * mana costs, cooldowns, consumables, equipment, travel and rest are decided
 * by the engine so the Storyteller can only narrate what actually happened.
 */
export interface ResolvedAction {
  /** Short player-facing summary for the story log. */
  summary: string;
  /** Detailed description for the Storyteller, including mechanical outcomes. */
  aiDescription: string;
  outcomes: string[];
  failures: string[];
  minutes: number;
  /** True when the hero said something aloud this turn (enables "player_told" knowledge changes). */
  communicated: boolean;
  /** True when the turn consists only of thoughts/emotions/silence. */
  internalOnly: boolean;
  usedAbilityIds: string[];
  levelUps: number[];
}

/** Longest skip a player can state in words ("прошло 12 дней"). */
const MAX_STATED_MINUTES = 60 * 24 * 365;

const BASE_MINUTES: Record<ActionPart["kind"], number> = {
  say: 2,
  do: 5,
  think: 0,
  silent: 1,
  emotion: 0,
  ability: 3,
  item: 2,
  travel: 0,
  rest: 0,
  free: 5,
};

export function findAbility(scenario: Scenario, abilityId: string): Ability | undefined {
  return scenario.abilities.find((a) => a.id === abilityId);
}

/** Why the hero cannot use an ability right now, or null if they can. */
export function abilityBlocker(state: GameState, scenario: Scenario, abilityId: string): string | null {
  const ability = findAbility(scenario, abilityId);
  const owned = state.player.abilities.find((a) => a.abilityId === abilityId);
  if (!ability || !owned) return "герой не владеет этой способностью";
  if (ability.passive) return "это пассивная способность, она действует сама";
  const req = ability.requirements;
  if (req.minLevel !== undefined && state.player.level < req.minLevel) return `нужен уровень ${req.minLevel}`;
  const stats = effectiveStats(state, scenario);
  for (const [statId, min] of Object.entries(req.stats)) {
    if ((stats[statId] ?? 0) < min) return `нужно ${statId} ≥ ${min}`;
  }
  for (const id of req.abilityIds) {
    if (!state.player.abilities.some((a) => a.abilityId === id)) return `нужна способность ${id}`;
  }
  for (const id of req.itemIds) {
    if (itemQuantity(state, id) === 0) return `нужен предмет ${findItem(scenario, id, state)?.name ?? id}`;
  }
  for (const flag of req.flags) {
    if (state.flags[flag] !== true) return `условие «${flag}» не выполнено`;
  }
  if (owned.readyAt > state.clock) return `перезарядка ещё ${formatDuration(owned.readyAt - state.clock)}`;
  const energyId = scenario.mechanics.energyResourceId;
  const pool = state.player.resources[energyId];
  if (ability.energyCost > 0 && (!pool || pool.current < ability.energyCost)) {
    return `не хватает ресурса (${ability.energyCost} нужно, ${Math.floor(pool?.current ?? 0)} есть)`;
  }
  return null;
}

function resolveAbility(state: GameState, scenario: Scenario, part: Extract<ActionPart, { kind: "ability" }>, out: ResolvedAction): string {
  const ability = findAbility(scenario, part.abilityId);
  const name = ability?.name ?? part.abilityId;
  const target = part.target ? ` (цель: ${part.target})` : "";
  const blocker = abilityBlocker(state, scenario, part.abilityId);
  if (!ability || blocker) {
    out.failures.push(`Способность «${name}» не сработала: ${blocker ?? "неизвестна"}.`);
    return `Пытается применить способность «${name}»${target}, но НЕ МОЖЕТ: ${blocker ?? "неизвестна"}. Опиши неудачную попытку.`;
  }
  const owned = state.player.abilities.find((a) => a.abilityId === ability.id);
  if (!owned) return "";
  const energyId = scenario.mechanics.energyResourceId;
  if (ability.energyCost > 0) changeResource(state, energyId, -ability.energyCost);
  owned.readyAt = state.clock + ability.cooldown;
  owned.timesUsed += 1;
  owned.mastery = Math.min(100, owned.mastery + 1);
  const effects = ability.effects.map((e) => applyEffect(state, scenario, e, ability.name)).filter((x): x is string => x !== null);
  out.usedAbilityIds.push(ability.id);
  out.outcomes.push(`Способность «${ability.name}» применена${ability.energyCost > 0 ? ` (−${ability.energyCost})` : ""}.`, ...effects);
  return `Применяет способность «${ability.name}»${target}. Мастерство ${owned.mastery}/100, сложность ${ability.difficulty}/10. Описание: ${ability.description}${effects.length ? ` Механический результат: ${effects.join("; ")}.` : ""}`;
}

function resolveItem(state: GameState, scenario: Scenario, part: Extract<ActionPart, { kind: "item" }>, out: ResolvedAction): string {
  const item = findItem(scenario, part.itemId, state);
  const name = item?.name ?? part.itemId;
  if (!item || itemQuantity(state, item.id) === 0) {
    out.failures.push(`Предмета «${name}» нет в инвентаре.`);
    return `Тянется за предметом «${name}», но его НЕТ в инвентаре.`;
  }
  const target = part.target ? ` (${part.target})` : "";
  switch (part.mode) {
    case "use": {
      if (item.type === "consumable") {
        removeItem(state, item.id, 1);
        const effects = item.effects.map((e) => applyEffect(state, scenario, e, item.name)).filter((x): x is string => x !== null);
        out.outcomes.push(`Использован предмет «${item.name}».`, ...effects);
        return `Использует «${item.name}»${target}. ${item.description}${effects.length ? ` Результат: ${effects.join("; ")}.` : ""}`;
      }
      // A non-consumable thing being used is in the hero's hands (or worn) from now on.
      const held = equipItem(state, scenario, item.id);
      if (held.ok) out.outcomes.push(`Экипировано: «${item.name}».`);
      return `Достаёт и использует предмет «${item.name}»${target}. ${item.description}`;
    }
    case "equip": {
      // Items without a slot of their own are simply held in hand.
      const res = equipItem(state, scenario, item.id);
      if (!res.ok) {
        out.failures.push(`«${item.name}» нельзя экипировать: ${res.reason}.`);
        return `Пытается взять «${item.name}», но это невозможно.`;
      }
      out.outcomes.push(`Экипировано: «${item.name}».`);
      return `Экипирует «${item.name}».`;
    }
    case "unequip": {
      for (const [slot, id] of Object.entries(state.player.equipment)) if (id === item.id) delete state.player.equipment[slot];
      out.outcomes.push(`Снято: «${item.name}».`);
      return `Снимает «${item.name}».`;
    }
    case "give": {
      removeItem(state, item.id, 1);
      out.outcomes.push(`Отдан предмет «${item.name}»${target}.`);
      return `Отдаёт «${item.name}»${target}.`;
    }
    case "show":
      return `Показывает «${item.name}»${target}.`;
  }
}

function resolveTravel(state: GameState, scenario: Scenario, locationId: string, out: ResolvedAction): string {
  const dest = scenario.locations.find((l) => l.id === locationId);
  if (!dest) {
    out.failures.push("Неизвестное место.");
    return "Хочет отправиться в неизвестное место.";
  }
  if (dest.id === state.player.locationId) return `Остаётся в локации «${dest.name}».`;
  const route = findRoute(state, scenario, state.player.locationId, dest.id);
  if (route === null) {
    out.failures.push(`Герой не знает дороги в «${dest.name}».`);
    return `Хочет попасть в «${dest.name}», но не знает дороги.`;
  }
  out.minutes += route;
  state.player.locationId = dest.id;
  markVisited(state, dest.id, dest.name);
  out.outcomes.push(`Перемещение: «${dest.name}» (${formatDuration(route)}).`);
  return `Отправляется в «${dest.name}». Дорога занимает ${formatDuration(route)}. Опиши путь кратко и прибытие подробно.`;
}

function resolveRest(state: GameState, scenario: Scenario, part: Extract<ActionPart, { kind: "rest" }>, out: ResolvedAction): string {
  out.minutes += part.minutes;
  const hours = part.minutes / 60;
  const health = scenario.mechanics.healthResourceId;
  const energy = scenario.mechanics.energyResourceId;
  const labels = { wait: "Ждёт", sleep: "Спит", train: "Тренируется", study: "Учится" } as const;
  if (part.activity === "sleep") {
    const hpPool = state.player.resources[health];
    const enPool = state.player.resources[energy];
    if (enPool) changeResource(state, energy, enPool.max * Math.min(1, hours / 6));
    if (hpPool) changeResource(state, health, hpPool.max * Math.min(0.5, hours / 12));
    out.outcomes.push("Сон восстановил силы.");
  } else if (part.activity === "train" || part.activity === "study") {
    const gained = grantXp(state, scenario.system, Math.floor(hours * 10));
    out.levelUps.push(...gained.map((g) => g.level));
    const enPool = state.player.resources[energy];
    if (part.activity === "train" && enPool) changeResource(state, energy, -Math.min(enPool.current, hours * 5));
    out.outcomes.push(`${labels[part.activity]} ${formatDuration(part.minutes)}.`);
  }
  return `${labels[part.activity]} ${formatDuration(part.minutes)}. Пропусти время сжато, отметь, что изменилось вокруг.`;
}

function describePart(state: GameState, scenario: Scenario, part: ActionPart, out: ResolvedAction): { summary: string; ai: string } {
  out.minutes += BASE_MINUTES[part.kind];
  switch (part.kind) {
    case "say":
      out.communicated = true;
      return { summary: `«${part.text}»`, ai: `Говорит вслух: «${part.text}»` };
    case "do":
      return { summary: part.text, ai: `Действие: ${part.text}` };
    case "think":
      return { summary: `(мысли) ${part.text}`, ai: `Думает про себя (NPC ЭТОГО НЕ СЛЫШАТ и не могут знать): ${part.text}` };
    case "silent":
      return { summary: "Молчит", ai: "Намеренно молчит и ничего не отвечает." };
    case "emotion":
      return {
        summary: `${emotionLabel(part.emotion)} (${intensityLabel(part.intensity)})`,
        ai: `Эмоция героя: ${emotionLabel(part.emotion)}, ${intensityLabel(part.intensity)} (${part.intensity}/5). Покажи её через мимику и жесты.`,
      };
    case "ability": {
      const ai = resolveAbility(state, scenario, part, out);
      const name = scenario.abilities.find((a) => a.id === part.abilityId)?.name ?? part.abilityId;
      return { summary: `Способность: ${name}${part.target ? ` → ${part.target}` : ""}`, ai };
    }
    case "item": {
      const ai = resolveItem(state, scenario, part, out);
      const name = findItem(scenario, part.itemId, state)?.name ?? part.itemId;
      return { summary: `Предмет: ${name}`, ai };
    }
    case "travel": {
      const ai = resolveTravel(state, scenario, part.locationId, out);
      const name = scenario.locations.find((l) => l.id === part.locationId)?.name ?? part.locationId;
      return { summary: `Идти: ${name}`, ai };
    }
    case "rest":
      return { summary: `Отдых/занятие: ${formatDuration(part.minutes)}`, ai: resolveRest(state, scenario, part, out) };
    case "free":
      out.communicated = true;
      return { summary: part.text, ai: `Свободное действие игрока: ${part.text}` };
  }
}

/** Mutates `state` with deterministic consequences of the action and describes it for the AI. */
export function resolvePlayerAction(state: GameState, scenario: Scenario, action: PlayerAction): ResolvedAction {
  const out: ResolvedAction = {
    summary: "",
    aiDescription: "",
    outcomes: [],
    failures: [],
    minutes: 0,
    communicated: false,
    internalOnly: action.parts.every((p) => p.kind === "think" || p.kind === "emotion" || p.kind === "silent"),
    usedAbilityIds: [],
    levelUps: [],
  };
  const described = action.parts.map((part) => describePart(state, scenario, part, out));
  out.summary = described.map((d) => d.summary).join(" + ");
  out.aiDescription = described.map((d, i) => `${i + 1}. ${d.ai}`).join("\n");
  const stated = Math.min(MAX_STATED_MINUTES, Math.max(0, ...action.parts.map((p) => (p.kind === "do" || p.kind === "free" ? statedDurationMinutes(p.text) : 0))));
  if (stated > out.minutes) {
    out.minutes = stated;
    out.aiDescription += `\nИгрок явно указал, что проходит ${formatDuration(stated)}: время в мире уже сдвинуто на этот срок, опиши этот промежуток сжато.`;
  }
  // "Достаю палочку" puts the wand into the hero's hands.
  const taken = action.parts.flatMap((p) => (p.kind === "do" || p.kind === "free" ? equipFromText(state, scenario, p.text) : []));
  if (taken.length > 0) {
    out.outcomes.push(`Экипировано: ${[...new Set(taken)].join(", ")}`);
    out.aiDescription += `\nГерой теперь держит в руках или носит: ${[...new Set(taken)].join(", ")}.`;
  }
  out.minutes = Math.max(1, out.minutes);
  return out;
}

/** Adds an item from the scenario to the inventory (used by quests, rewards, AI changes). */
export function giveItem(state: GameState, scenario: Scenario, itemId: string, quantity: number): boolean {
  const item = findItem(scenario, itemId, state);
  if (!item) return false;
  addItem(state, item, quantity);
  return true;
}
