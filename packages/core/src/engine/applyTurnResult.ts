import { clamp, slugify, uniqueId } from "../domain/common";
import { nextId, type GameState } from "../domain/gameState";
import type { Scenario } from "../domain/scenario";
import type {
  KnowledgeChange,
  NewMemory,
  NPCUpdate,
  QuestChange,
  RelationshipChange,
  StateChange,
  TimelineChange,
  TurnResult,
  WorldChange,
} from "../domain/turnResult";
import type { ResolvedAction } from "./actions";
import { findAbility, giveItem } from "./actions";
import { grantXp } from "./progression";
import {
  addJournal,
  addPlayerKnowledge,
  addStatusEffect,
  changeResource,
  changeStat,
  findItem,
  findStat,
  itemQuantity,
  removeItem,
  setFlag,
} from "./mutations";
import { applyRelationshipDelta, axisById, relationValue } from "./relationships";
import { markVisited } from "./world";

export interface RejectedChange {
  kind: string;
  detail: string;
  reason: string;
}

export interface ApplyReport {
  applied: string[];
  rejected: RejectedChange[];
  levelUps: number[];
  completedQuestIds: string[];
  newArcTitle?: string;
  sceneTitle?: string;
}

export interface ApplyContext {
  resolved: ResolvedAction;
  /** NPCs present at the start or end of the turn: only they may remember it. */
  presentNpcIds: string[];
}

const XP_PER_TURN_CAP = 200;
const PROGRESSION_MULTIPLIER = { slow: 0.5, normal: 1, fast: 2 } as const;
const MAX_STAT_DELTA = 2;
const MAX_MASTERY_DELTA = 5;
const MAX_EFFECT_MINUTES = 60 * 24 * 7;
const MAX_ABILITIES_LEARNED_PER_TURN = 1;

class Applier {
  readonly report: ApplyReport = { applied: [], rejected: [], levelUps: [], completedQuestIds: [] };
  private abilitiesLearned = 0;

  constructor(
    private readonly state: GameState,
    private readonly scenario: Scenario,
    private readonly ctx: ApplyContext,
  ) {}

  private reject(kind: string, detail: unknown, reason: string): void {
    this.report.rejected.push({ kind, detail: JSON.stringify(detail), reason });
  }

  private ok(text: string): void {
    this.report.applied.push(text);
  }

  /** True when `text` mentions a player secret that none of `npcIds` knows. */
  private leaksSecret(text: string, npcIds: string[]): string | null {
    const lower = text.toLowerCase();
    for (const secret of this.state.player.secrets) {
      const known = npcIds.some((id) => secret.knownByNpcIds.includes(id));
      if (known) continue;
      if (secret.keywords.some((k) => k.length > 2 && lower.includes(k.toLowerCase()))) return secret.id;
    }
    return null;
  }

  stateChange(change: StateChange): void {
    const { state, scenario } = this;
    switch (change.type) {
      case "resource": {
        const pool = state.player.resources[change.resourceId];
        if (!pool) return this.reject("resource", change, "неизвестный ресурс");
        const limit = pool.max * (scenario.rules.worldLethality === "high" ? 0.8 : 0.6);
        let delta = clamp(change.delta, -limit, limit);
        const isHealth = change.resourceId === scenario.mechanics.healthResourceId;
        if (isHealth && !scenario.rules.playerCanDie && pool.current + delta < 1) delta = 1 - pool.current;
        const res = changeResource(state, change.resourceId, delta);
        if (res) this.ok(`${findStat(scenario, change.resourceId)?.name ?? change.resourceId}: ${Math.round(res.from)} → ${Math.round(res.to)}`);
        if (isHealth && pool.current <= 0 && scenario.rules.playerCanDie) {
          state.player.alive = false;
          this.ok("Герой погиб.");
        }
        return;
      }
      case "stat": {
        const res = changeStat(state, scenario, change.statId, clamp(change.delta, -MAX_STAT_DELTA, MAX_STAT_DELTA));
        if (!res) return this.reject("stat", change, "неизвестная характеристика");
        return this.ok(`${findStat(scenario, change.statId)?.name}: ${res.from} → ${res.to}`);
      }
      case "item_add": {
        const quantity = clamp(change.quantity, 1, 10);
        let item = findItem(scenario, change.itemId, state);
        if (!item) {
          if (!change.name) return this.reject("item_add", change, "предмет не существует в сценарии и не имеет названия");
          // Improvised item: allowed, but never with mechanical effects.
          const id = uniqueId(`custom-${slugify(change.name)}`, [...scenario.items.map((i) => i.id), ...state.customItems.map((i) => i.id)]);
          item = { id, name: change.name, description: change.description ?? "", type: "misc", effects: [], value: 0, stackable: true, tags: ["improvised"], hidden: false, visualDescription: "" };
          state.customItems.push(item);
        }
        giveItem(state, scenario, item.id, quantity);
        return this.ok(`Получено: ${item.name} ×${quantity}`);
      }
      case "item_remove": {
        const item = findItem(scenario, change.itemId, state);
        if (!item || itemQuantity(state, change.itemId) < change.quantity) return this.reject("item_remove", change, "у героя нет этого предмета");
        removeItem(state, change.itemId, change.quantity);
        return this.ok(`Потеряно: ${item.name} ×${change.quantity}`);
      }
      case "currency": {
        const known = scenario.system.currencies.some((c) => c.id === change.currencyId) || change.currencyId in state.player.currency;
        if (!known) return this.reject("currency", change, "неизвестная валюта");
        const current = state.player.currency[change.currencyId] ?? 0;
        if (current + change.delta < 0) return this.reject("currency", change, "недостаточно средств");
        state.player.currency[change.currencyId] = current + change.delta;
        return this.ok(`${change.currencyId}: ${current} → ${current + change.delta}`);
      }
      case "xp": {
        if (!scenario.system.enabled || change.amount <= 0) return this.reject("xp", change, "система опыта отключена или опыт отрицательный");
        const amount = Math.min(XP_PER_TURN_CAP, change.amount) * PROGRESSION_MULTIPLIER[scenario.rules.progressionSpeed];
        const ups = grantXp(state, scenario.system, amount);
        this.report.levelUps.push(...ups.map((u) => u.level));
        return this.ok(`Опыт +${Math.round(amount)}`);
      }
      case "ability_learn": {
        const ability = findAbility(scenario, change.abilityId);
        if (!ability) return this.reject("ability_learn", change, "способность не определена сценарием");
        if (state.player.abilities.some((a) => a.abilityId === ability.id)) return this.reject("ability_learn", change, "уже изучена");
        if (this.abilitiesLearned >= MAX_ABILITIES_LEARNED_PER_TURN) return this.reject("ability_learn", change, "за ход можно освоить одну способность");
        this.abilitiesLearned += 1;
        state.player.abilities.push({ abilityId: ability.id, mastery: Math.min(ability.mastery, 20), readyAt: 0, timesUsed: 0 });
        addJournal(state, "system", `Новая способность: ${ability.name}`);
        return this.ok(`Новая способность: ${ability.name}`);
      }
      case "ability_mastery": {
        const owned = state.player.abilities.find((a) => a.abilityId === change.abilityId);
        if (!owned) return this.reject("ability_mastery", change, "способность не изучена");
        owned.mastery = clamp(owned.mastery + clamp(change.delta, -MAX_MASTERY_DELTA, MAX_MASTERY_DELTA), 0, 100);
        return this.ok(`Мастерство «${findAbility(scenario, owned.abilityId)?.name}»: ${owned.mastery}`);
      }
      case "effect_add": {
        if (state.player.activeEffects.length >= 12) return this.reject("effect_add", change, "слишком много эффектов");
        const duration = change.durationMinutes !== undefined ? clamp(change.durationMinutes, 1, MAX_EFFECT_MINUTES) : undefined;
        addStatusEffect(state, change.name.slice(0, 60), change.description.slice(0, 300), duration, "story");
        return this.ok(`Эффект: ${change.name}`);
      }
      case "effect_remove": {
        const before = state.player.activeEffects.length;
        state.player.activeEffects = state.player.activeEffects.filter((e) => e.name !== change.name);
        if (before === state.player.activeEffects.length) return this.reject("effect_remove", change, "эффекта нет");
        return this.ok(`Эффект снят: ${change.name}`);
      }
      case "move": {
        const location = scenario.locations.find((l) => l.id === change.locationId);
        if (!location) return this.reject("move", change, "неизвестная локация");
        state.player.locationId = location.id;
        markVisited(state, location.id, location.name);
        return this.ok(`Локация: ${location.name}`);
      }
      case "flag":
        setFlag(state, change.key.slice(0, 80), change.value);
        return this.ok(`Флаг ${change.key} = ${String(change.value)}`);
      case "player_knowledge":
        if (addPlayerKnowledge(state, change.fact.slice(0, 500), "learned")) this.ok(`Узнал: ${change.fact}`);
        return;
      case "achievement": {
        const def = scenario.system.achievements.find((a) => a.id === change.achievementId);
        if (!scenario.system.enabled || !scenario.system.modules.achievements || !def) return this.reject("achievement", change, "достижение не определено");
        if (state.player.achievements.includes(def.id)) return;
        state.player.achievements.push(def.id);
        addJournal(state, "system", `Достижение: ${def.name}`);
        return this.ok(`Достижение: ${def.name}`);
      }
      case "title": {
        const def = scenario.system.titles.find((t) => t.id === change.titleId);
        if (!scenario.system.enabled || !def) return this.reject("title", change, "титул не определён");
        if (!state.player.titles.includes(def.id)) state.player.titles.push(def.id);
        return this.ok(`Титул: ${def.name}`);
      }
      case "player_death": {
        if (!scenario.rules.playerCanDie) return this.reject("player_death", change, "в этом сценарии герой не может умереть");
        state.player.alive = false;
        return this.ok(`Герой погиб: ${change.reason}`);
      }
    }
  }

  relationship(change: RelationshipChange): void {
    const npc = this.state.npcs[change.npcId];
    const axis = axisById(this.scenario, change.axis);
    if (!npc || !axis) return this.reject("relationship", change, "неизвестный NPC или параметр отношений");
    if (change.axis === "romantic_interest" && change.delta > 0 && this.scenario.rules.romance === "none") {
      return this.reject("relationship", change, "романтика отключена правилами сценария");
    }
    const { from, to } = applyRelationshipDelta(npc, axis, change.delta);
    if (from !== to) this.ok(`${npc.id}: ${axis.label} ${from > to ? "↓" : "↑"}`);
  }

  memory(memory: NewMemory): void {
    const event = memory.event.slice(0, 600);
    if (memory.owner === "story") {
      this.state.memory.longTerm.push({
        id: nextId(this.state, "mem"),
        event,
        importance: clamp(Math.round(memory.importance), 0, 100),
        emotionalImpact: memory.emotionalImpact,
        timestamp: this.state.clock,
        turn: this.state.turn,
        participants: memory.participants,
      });
      return;
    }
    const npc = this.state.npcs[memory.owner];
    if (!npc || !npc.alive) return this.reject("memory", memory, "NPC не существует или мёртв");
    if (!this.ctx.presentNpcIds.includes(npc.id)) return this.reject("memory", memory, "NPC не присутствовал и не мог это запомнить");
    const leaked = this.leaksSecret(event, [npc.id]);
    if (leaked && !npc.knownSecretIds.includes(leaked)) return this.reject("memory", memory, `воспоминание раскрывает секрет «${leaked}», которого NPC не знает`);
    npc.memories.push({
      id: nextId(this.state, "mem"),
      event,
      importance: clamp(Math.round(memory.importance), 0, 100),
      emotionalImpact: memory.emotionalImpact,
      timestamp: this.state.clock,
      turn: this.state.turn,
      participants: memory.participants,
    });
  }

  quest(change: QuestChange): void {
    const { state, scenario } = this;
    const def = scenario.quests.find((q) => q.id === change.questId);
    if (!def) return this.reject("quest", change, "квест не определён сценарием");
    const quest = state.quests[def.id] ?? { status: "inactive" as const, objectives: {}, notes: [] };
    state.quests[def.id] = quest;
    const start = () => {
      if (quest.status !== "inactive") return;
      quest.status = "active";
      quest.startedAtTurn = state.turn;
      addJournal(state, "quest", `Новый квест: ${def.title}`);
      this.ok(`Новый квест: ${def.title}`);
    };
    switch (change.action) {
      case "start":
        return start();
      case "complete_objective": {
        const objective = def.objectives.find((o) => o.id === change.objectiveId);
        if (!objective) return this.reject("quest", change, "цель не найдена");
        if (quest.status === "completed" || quest.status === "failed") return this.reject("quest", change, "квест уже завершён");
        start();
        quest.objectives[objective.id] = true;
        this.ok(`Цель выполнена: ${objective.description}`);
        const allDone = def.objectives.filter((o) => !o.optional).every((o) => quest.objectives[o.id]);
        if (allDone) this.completeQuest(def.id);
        return;
      }
      case "complete":
        if (quest.status === "completed") return;
        start();
        return this.completeQuest(def.id);
      case "fail":
        if (quest.status !== "active") return this.reject("quest", change, "квест не активен");
        quest.status = "failed";
        addJournal(state, "quest", `Квест провален: ${def.title}`);
        return this.ok(`Квест провален: ${def.title}`);
      case "note":
        if (change.note) quest.notes.push(change.note.slice(0, 300));
        return;
    }
  }

  private completeQuest(questId: string): void {
    const { state, scenario } = this;
    const def = scenario.quests.find((q) => q.id === questId);
    const quest = state.quests[questId];
    if (!def || !quest || quest.status === "completed") return;
    quest.status = "completed";
    for (const o of def.objectives) if (!o.optional) quest.objectives[o.id] = true;
    const ups = grantXp(state, scenario.system, def.rewards.xp);
    this.report.levelUps.push(...ups.map((u) => u.level));
    for (const reward of def.rewards.items) giveItem(state, scenario, reward.itemId, reward.quantity);
    for (const [currencyId, amount] of Object.entries(def.rewards.currency)) {
      state.player.currency[currencyId] = (state.player.currency[currencyId] ?? 0) + amount;
    }
    this.report.completedQuestIds.push(questId);
    addJournal(state, "quest", `Квест выполнен: ${def.title}`);
    this.ok(`Квест выполнен: ${def.title}`);
  }

  world(change: WorldChange): void {
    const { state, scenario } = this;
    state.worldFacts.push({ id: nextId(state, "fact"), text: change.description.slice(0, 600), importance: clamp(Math.round(change.importance), 0, 100), turn: state.turn, timestamp: state.clock });
    if (change.flag) setFlag(state, change.flag.key, change.flag.value);
    if (change.factionId && change.reputationDelta !== undefined) {
      if (!scenario.factions.some((f) => f.id === change.factionId)) return this.reject("world", change, "неизвестная фракция");
      const rep = state.factions[change.factionId] ?? { reputation: 0 };
      rep.reputation = clamp(rep.reputation + clamp(change.reputationDelta, -20, 20), -100, 100);
      state.factions[change.factionId] = rep;
    }
    if (change.importance >= 50) addJournal(state, "event", change.description);
    this.ok(`Мир: ${change.description}`);
  }

  knowledge(change: KnowledgeChange): void {
    const { state } = this;
    const npc = state.npcs[change.npcId];
    if (!npc || !npc.alive) return this.reject("knowledge", change, "NPC не существует или мёртв");
    if (change.secretId) {
      const secret = state.player.secrets.find((s) => s.id === change.secretId);
      if (!secret) return this.reject("knowledge", change, "неизвестный секрет игрока");
      if (secret.knownByNpcIds.includes(npc.id)) return;
      if (this.ctx.resolved.internalOnly) return this.reject("knowledge", change, "герой только думал — NPC не слышат мыслей");
      if (change.source === "player_told" && !this.ctx.resolved.communicated) return this.reject("knowledge", change, "герой ничего не говорил");
      if (!this.ctx.presentNpcIds.includes(npc.id) && change.source !== "rumor") return this.reject("knowledge", change, "NPC не присутствовал");
      const suspicion = axisById(this.scenario, "suspicion");
      if (change.source === "deduced" && suspicion && relationValue(npc, suspicion) < 50) {
        return this.reject("knowledge", change, "у NPC недостаточно подозрений, чтобы догадаться");
      }
      secret.knownByNpcIds.push(npc.id);
      npc.knownSecretIds.push(secret.id);
      addJournal(state, "secret", `${npc.id} узнал секрет: ${secret.description}`);
      return this.ok(`${npc.id} узнал секрет героя`);
    }
    if (change.fact) {
      const fact = change.fact.slice(0, 400);
      const leaked = this.leaksSecret(fact, [npc.id]);
      if (leaked) return this.reject("knowledge", change, `факт раскрывает секрет «${leaked}» без источника`);
      if (!npc.knowledge.includes(fact)) npc.knowledge.push(fact);
    }
  }

  npcUpdate(update: NPCUpdate): void {
    const { state, scenario } = this;
    const npc = state.npcs[update.npcId];
    if (!npc) return this.reject("npc", update, "неизвестный NPC");
    if (update.alive === true && !npc.alive) return this.reject("npc", update, "мёртвые NPC не возвращаются без причины, заложенной сценарием");
    if (update.alive === false && npc.alive) {
      npc.alive = false;
      addJournal(state, "event", `${scenario.npcs.find((n) => n.id === npc.id)?.name ?? npc.id} погиб(ла).`);
      this.ok(`${npc.id} погиб`);
    }
    if (update.mood) npc.mood = update.mood.slice(0, 40);
    if (update.locationId) {
      if (!scenario.locations.some((l) => l.id === update.locationId)) return this.reject("npc", update, "неизвестная локация");
      npc.locationId = update.locationId;
    }
    if (update.present === true) npc.locationId = state.player.locationId;
    if (update.present === false && npc.locationId === state.player.locationId) npc.locationId = undefined;
  }

  timeline(change: TimelineChange): void {
    const event = this.scenario.timeline.find((e) => e.id === change.eventId);
    if (!event) return this.reject("timeline", change, "неизвестное событие");
    if (!event.mutable) return this.reject("timeline", change, "событие зафиксировано автором сценария");
    const status = this.state.timeline[event.id]?.status ?? "pending";
    if (status !== "pending" && status !== "modified") return this.reject("timeline", change, "событие уже разрешено");
    this.state.timeline[event.id] = { status: change.action === "cancel" ? "cancelled" : "modified", note: change.note.slice(0, 400) };
    this.state.divergences.push({ id: nextId(this.state, "div"), turn: this.state.turn, eventId: event.id, description: `«${event.title}»: ${change.note}`, importance: event.importance });
    this.ok(`История изменилась: ${event.title}`);
  }
}

/**
 * Validates and applies the Storyteller's proposed changes. Every entry is
 * checked independently; rejected entries are reported, never applied.
 */
export function applyTurnResult(state: GameState, scenario: Scenario, result: TurnResult, ctx: ApplyContext): ApplyReport {
  const applier = new Applier(state, scenario, ctx);
  for (const change of result.stateChanges) applier.stateChange(change);
  for (const change of result.questChanges) applier.quest(change);
  for (const update of result.npcUpdates) applier.npcUpdate(update);
  for (const change of result.relationshipChanges) applier.relationship(change);
  for (const change of result.knowledgeChanges) applier.knowledge(change);
  for (const memory of result.newMemories) applier.memory(memory);
  for (const change of result.worldChanges) applier.world(change);
  for (const change of result.timelineChanges) applier.timeline(change);
  if (result.sceneChange) {
    applier.report.sceneTitle = result.sceneChange.title.slice(0, 120);
    if (result.sceneChange.newArc) applier.report.newArcTitle = result.sceneChange.newArc.slice(0, 120);
  }
  return applier.report;
}
