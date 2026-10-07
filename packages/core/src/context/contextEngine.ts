import type { GameState, NPCState } from "../domain/gameState";
import type { NPC, Scenario } from "../domain/scenario";
import { formatGameTime, formatTimelineDate, timelineDateToMinutes } from "../domain/time";
import type { ResolvedAction } from "../engine/actions";
import { effectiveStats, findItem } from "../engine/mutations";
import { xpToNextLevel } from "../engine/progression";
import { describeRelationship } from "../engine/relationships";
import type { TimelineOutcome } from "../engine/timeline";
import { keywords, permanentFacts, relevantMemories } from "../memory/memoryEngine";
import { compileRules, STORYTELLER_PRINCIPLES } from "../scenario/rulesCompiler";
import { TURN_RESULT_CONTRACT } from "./outputContract";

/** Rough token estimate. Cyrillic text averages ~3 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export interface ContextSection {
  name: string;
  text: string;
  /** Lower = more important. Required sections are always included. */
  priority: number;
  required: boolean;
}

export interface BuiltContext {
  system: string;
  user: string;
  sections: { name: string; tokens: number; included: boolean }[];
  estimatedTokens: number;
}

export interface StoryContextInput {
  scenario: Scenario;
  state: GameState;
  resolved: ResolvedAction;
  /** World events resolved before this turn that the hero may notice. */
  worldEvents?: TimelineOutcome[];
  /** Token budget for the dynamic part (user message). */
  budgetTokens?: number;
  /** Extra corrective instruction (e.g. after a secret leak was detected). */
  correction?: string;
}

const DEFAULT_BUDGET = 6000;

function npcDef(scenario: Scenario, id: string): NPC | undefined {
  return scenario.npcs.find((n) => n.id === id);
}

function list(items: string[], bullet = "- "): string {
  return items.filter(Boolean).map((i) => `${bullet}${i}`).join("\n");
}

/** Stable part of the prompt: principles, scenario rules, world essentials, output contract. Cache-friendly. */
export function buildStorytellerSystem(scenario: Scenario): string {
  const w = scenario.world;
  const world = [
    `Мир: ${w.name || scenario.metadata.title}. ${w.description}`,
    w.magicSystem && `Магия: ${w.magicSystem}`,
    w.powerSystem && `Система сил: ${w.powerSystem}`,
    w.technologyLevel && `Технологии: ${w.technologyLevel}`,
    w.politics && `Политика: ${w.politics}`,
    w.importantRules.length > 0 && `Важные правила мира:\n${list(w.importantRules)}`,
  ].filter(Boolean);
  return [
    "# Принципы рассказчика",
    list(STORYTELLER_PRINCIPLES),
    "# Правила этого сценария",
    list(compileRules(scenario.rules, scenario.system)),
    "# Мир",
    world.join("\n"),
    "# Формат ответа",
    TURN_RESULT_CONTRACT,
  ].join("\n\n");
}

function describeNpc(scenario: Scenario, state: GameState, npc: NPCState, query: Set<string>): string {
  const def = npcDef(scenario, npc.id);
  if (!def) return "";
  const relation = describeRelationship(scenario, npc, true).map((r) => `${r.label}: ${r.level} (${Math.round(r.value)})`).join(", ");
  const unknownSecrets = state.player.secrets.filter((s) => !s.knownByNpcIds.includes(npc.id));
  const knownSecrets = state.player.secrets.filter((s) => s.knownByNpcIds.includes(npc.id));
  const memories = relevantMemories(npc.memories, query, 5, state.turn).map((m) => `${m.event} (важность ${m.importance})`);
  return [
    `## ${def.name} [id: ${def.id}]${npc.met ? "" : " — герой видит его/её впервые"}`,
    def.description,
    def.appearance && `Внешность: ${def.appearance}`,
    def.personality && `Характер: ${def.personality}`,
    def.speechStyle && `Речь: ${def.speechStyle}`,
    def.goals.length > 0 && `Цели: ${def.goals.join("; ")}`,
    def.fears.length > 0 && `Страхи: ${def.fears.join("; ")}`,
    `Настроение: ${npc.mood}`,
    `Отношение к герою: ${relation}`,
    npc.knowledge.length > 0 && `Знает:\n${list(npc.knowledge.slice(-8))}`,
    memories.length > 0 && `Помнит:\n${list(memories)}`,
    def.secrets.length > 0 && `Собственные секреты (раскрывать только по веской причине): ${def.secrets.map((s) => s.description).join("; ")}`,
    knownSecrets.length > 0 && `Знает секреты героя: ${knownSecrets.map((s) => s.description).join("; ")}`,
    unknownSecrets.length > 0 && `НЕ ЗНАЕТ и не может упоминать или намекать: ${unknownSecrets.map((s) => s.description).join("; ")}`,
    def.aiInstructions && `Указания автора: ${def.aiInstructions}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function heroSection(scenario: Scenario, state: GameState): string {
  const p = state.player;
  const resources = Object.entries(p.resources).map(([id, r]) => `${scenario.mechanics.stats.find((s) => s.id === id)?.name ?? id} ${Math.round(r.current)}/${r.max}`);
  const stats = Object.entries(effectiveStats(state, scenario)).map(([id, v]) => `${scenario.mechanics.stats.find((s) => s.id === id)?.name ?? id} ${v}`);
  const fields = Object.entries(p.fields)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `${scenario.characterCreation.fields.find((f) => f.id === k)?.label ?? k}: ${v}`);
  const equipment = Object.entries(p.equipment).map(([slot, id]) => `${slot}: ${findItem(scenario, id, state)?.name ?? id}`);
  const sys = scenario.system;
  return [
    `Имя: ${p.name}`,
    ...fields,
    sys.enabled && sys.modules.levels && `Уровень ${p.level} (опыт ${p.xp}/${xpToNextLevel(sys, p.level)})`,
    `Ресурсы: ${resources.join(", ")}`,
    stats.length > 0 && `Характеристики: ${stats.join(", ")}`,
    equipment.length > 0 && `Экипировка: ${equipment.join(", ")}`,
    p.activeEffects.length > 0 && `Эффекты: ${p.activeEffects.map((e) => e.name).join(", ")}`,
    Object.keys(p.currency).length > 0 && `Деньги: ${Object.entries(p.currency).map(([k, v]) => `${v} ${sys.currencies.find((c) => c.id === k)?.name ?? k}`).join(", ")}`,
    p.secrets.length > 0 && `Секреты героя: ${p.secrets.map((s) => `[${s.id}] ${s.description} (знают: ${s.knownByNpcIds.join(", ") || "никто"})`).join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Builds the per-turn Storyteller prompt within a token budget. */
export function buildStoryContext(input: StoryContextInput): BuiltContext {
  const { scenario, state, resolved } = input;
  const budget = input.budgetTokens ?? DEFAULT_BUDGET;
  const location = scenario.locations.find((l) => l.id === state.player.locationId);
  const present = state.memory.currentScene.presentNpcIds.map((id) => state.npcs[id]).filter((n): n is NPCState => n !== undefined);
  const query = keywords([resolved.aiDescription, location?.name ?? "", ...present.map((n) => npcDef(scenario, n.id)?.name ?? "")].join(" "));
  const sections: ContextSection[] = [];
  const add = (name: string, text: string, priority: number, required = false) => {
    if (text.trim()) sections.push({ name, text: `### ${name}\n${text}`, priority, required });
  };

  add(
    "Сейчас",
    [
      `Время: ${formatGameTime(state.time, scenario.calendar)}`,
      `Локация: ${location?.name ?? state.player.locationId} [id: ${state.player.locationId}] — ${location?.description ?? ""}`,
      `Сцена: ${state.memory.currentScene.title}. Арка: ${state.memory.currentArc.title}.`,
      state.turn <= 1 && scenario.start.situation ? `Стартовая ситуация: ${scenario.start.situation}` : "",
    ].filter(Boolean).join("\n"),
    0,
    true,
  );
  add("Герой", heroSection(scenario, state), 0, true);
  add("Присутствуют", present.length > 0 ? present.map((n) => describeNpc(scenario, state, n, query)).join("\n\n") : "Рядом никого из важных персонажей.", 0, true);

  const permanent = permanentFacts(state).map((m) => m.event);
  add("Неизменные факты истории", list(permanent), 1, true);

  if (input.worldEvents && input.worldEvents.length > 0) {
    add(
      "События мира с прошлого хода",
      list(input.worldEvents.map((e) => (e.status === "occurred" ? `${e.title}: ${e.description}${e.witnessed ? " (происходит рядом с героем — покажи это)" : " (произошло без героя — он может узнать позже)"}` : `Не случилось: ${e.title} (${e.description})`))),
      1,
      true,
    );
  }

  const actionText = [
    resolved.aiDescription,
    resolved.outcomes.length > 0 && `Механика (уже применено движком, не дублируй в stateChanges): ${resolved.outcomes.join("; ")}`,
    resolved.failures.length > 0 && `НЕ УДАЛОСЬ: ${resolved.failures.join("; ")}`,
    resolved.internalOnly && "Герой ничего не сказал вслух: NPC видят только внешнее поведение.",
  ].filter(Boolean).join("\n");

  // Optional sections, by priority.
  const activeQuests = Object.entries(state.quests)
    .filter(([, q]) => q.status === "active")
    .map(([id, q]) => {
      const def = scenario.quests.find((d) => d.id === id);
      if (!def) return "";
      const objectives = def.objectives.map((o) => `  ${q.objectives[o.id] ? "[x]" : "[ ]"} ${o.description} [objectiveId: ${o.id}]`).join("\n");
      return `${def.title} [questId: ${id}] — ${def.description}\n${objectives}`;
    });
  add("Активные квесты", activeQuests.join("\n"), 2);

  const inactiveQuests = scenario.quests.filter((q) => (state.quests[q.id]?.status ?? "inactive") === "inactive").map((q) => `${q.title} [questId: ${q.id}]: ${q.description}`);
  add("Квесты, которые могут начаться по ходу истории", list(inactiveQuests), 6);

  const abilities = state.player.abilities.map((a) => {
    const def = scenario.abilities.find((d) => d.id === a.abilityId);
    return def ? `${def.name} [id: ${def.id}] — ${def.category}, мастерство ${a.mastery}, стоимость ${def.energyCost}${def.passive ? ", пассивная" : ""}: ${def.description}` : "";
  });
  add("Способности героя", list(abilities), 3);
  const inventory = state.player.inventory.map((e) => `${findItem(scenario, e.itemId, state)?.name ?? e.itemId} ×${e.quantity} [id: ${e.itemId}]`);
  add("Инвентарь", list(inventory), 3);

  const known = state.player.knowledge.map((k) => `${k.text}${k.source === "canon" ? " (знание героя о «каноне»)" : ""}`);
  add("Знания героя (только герой это знает)", list(known.slice(-12)), 3);

  const divergences = state.divergences.slice(-6).map((d) => d.description);
  add("Расхождения с исходной историей", list(divergences), 3);

  const upcoming = scenario.timeline
    .filter((e) => (state.timeline[e.id]?.status ?? "pending") === "pending" || state.timeline[e.id]?.status === "modified")
    .filter((e) => timelineDateToMinutes(e.date, scenario.calendar) - state.clock < 60 * 24 * 30)
    .filter((e) => !e.hidden || scenario.start.playerKnowledge !== "none")
    .map((e) => `${formatTimelineDate(e.date, scenario.calendar)} — ${e.title} [eventId: ${e.id}${e.mutable ? ", изменяемое" : ", фиксированное"}]: ${e.description}${state.timeline[e.id]?.note ? ` (изменено: ${state.timeline[e.id]?.note})` : ""}`);
  add("Ближайшие события исходной временной линии", list(upcoming), 4);

  const flags = Object.entries(state.flags).map(([k, v]) => `${k} = ${String(v)}`);
  add("Флаги истории", flags.join(", "), 4);

  const facts = [...state.worldFacts].sort((a, b) => b.importance - a.importance || b.turn - a.turn).slice(0, 10).map((f) => f.text);
  add("Состояние мира", list(facts), 4);

  const longTerm = relevantMemories(state.memory.longTerm.filter((m) => m.importance < 80), query, 8, state.turn).map((m) => m.event);
  add("Долгосрочная память", list(longTerm), 4);

  add("Краткое содержание прошлых арок", state.memory.arcSummaries.map((a) => `${a.title}: ${a.text}`).join("\n"), 5);
  add("Предыдущие сцены текущей арки", state.memory.sceneSummaries.map((s) => `${s.title}: ${s.text}`).join("\n"), 3);

  const lore = scenario.lore
    .filter((l) => [...keywords(`${l.name} ${l.tags.join(" ")}`)].some((k) => query.has(k)) || l.visibility === "public")
    .slice(0, 8)
    .map((l) => `${l.name} (${l.visibility === "public" ? "общеизвестно" : l.visibility === "hidden" ? "мало кто знает" : "тайна"}): ${l.description}${l.aiInstructions ? ` — ${l.aiInstructions}` : ""}`);
  add("Лор", list(lore), 5);

  const otherNpcs = Object.values(state.npcs)
    .filter((n) => !state.memory.currentScene.presentNpcIds.includes(n.id))
    .map((n) => `${npcDef(scenario, n.id)?.name ?? n.id} [id: ${n.id}] — ${n.alive ? `в ${n.locationId ?? "неизвестно где"}, настроение: ${n.mood}` : "мёртв(а)"}`);
  add("Другие персонажи (не в сцене)", list(otherNpcs), 5);

  const locations = scenario.locations
    .filter((l) => state.locations[l.id]?.discovered)
    .map((l) => `${l.name} [id: ${l.id}]`);
  add("Известные локации", locations.join(", "), 5);

  // Assemble: required first, then optional by priority while the budget allows.
  const recentCap = Math.floor(budget * 0.35);
  const recent: string[] = [];
  let recentTokens = 0;
  for (const entry of [...state.memory.recent].reverse()) {
    const text = `[Ход ${entry.turn}]${entry.action ? ` Игрок: ${entry.action}\n` : "\n"}${entry.narrative}`;
    const t = estimateTokens(text);
    if (recent.length >= 2 && recentTokens + t > recentCap) break;
    recent.unshift(text);
    recentTokens += t;
  }
  const actionSection = `### Действие игрока в этом ходу\n${actionText}${input.correction ? `\n\n### ВАЖНО\n${input.correction}` : ""}`;
  const recentSection = recent.length > 0 ? `### Последние события (дословно)\n${recent.join("\n\n")}` : "";

  let used = estimateTokens(actionSection) + recentTokens;
  const report: BuiltContext["sections"] = [];
  const included: ContextSection[] = [];
  for (const section of [...sections].sort((a, b) => Number(b.required) - Number(a.required) || a.priority - b.priority)) {
    const t = estimateTokens(section.text);
    const fits = section.required || used + t <= budget;
    report.push({ name: section.name, tokens: t, included: fits });
    if (fits) {
      included.push(section);
      used += t;
    }
  }
  report.push({ name: "Последние события", tokens: recentTokens, included: true }, { name: "Действие игрока", tokens: estimateTokens(actionSection), included: true });

  included.sort((a, b) => a.priority - b.priority);
  const user = [...included.map((s) => s.text), recentSection, actionSection].filter(Boolean).join("\n\n");
  const system = buildStorytellerSystem(scenario);
  return { system, user, sections: report, estimatedTokens: estimateTokens(system) + estimateTokens(user) };
}
