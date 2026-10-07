import {
  abilityBlocker,
  describeRelationship,
  effectiveStats,
  findItem,
  formatGameTime,
  formatTimelineDate,
  presentNpcIds,
  timelineView,
  xpToNextLevel,
  type GameState,
  type Scenario,
} from "@aetherfall/core";

/**
 * What the player is allowed to see. Built on the server from the scenario
 * and the GameState, so the browser never receives NPC secrets, hidden
 * timeline events, hidden relationship axes or raw relationship numbers.
 */
export interface PlayerView {
  scenario: { id: string; title: string; version: string; authorName: string };
  turn: number;
  time: string;
  alive: boolean;
  scene: { title: string; arc: string };
  location: { id: string; name: string; description: string; region: string; connections: { id: string; name: string; minutes: number }[] };
  present: { id: string; name: string; mood: string; known: boolean }[];
  player: {
    name: string;
    fields: { label: string; value: string }[];
    level: number;
    xp: number;
    xpToNext: number;
    skillPoints: number;
    attributePoints: number;
    resources: { id: string; name: string; current: number; max: number }[];
    stats: { id: string; name: string; description: string; value: number; base: number }[];
    currency: { id: string; name: string; amount: number }[];
    effects: { id: string; name: string; description: string; remaining: string | null }[];
    titles: string[];
    achievements: string[];
  };
  abilityCategories: { id: string; label: string }[];
  abilities: {
    id: string;
    name: string;
    description: string;
    category: string;
    categoryLabel: string;
    mastery: number;
    difficulty: number;
    energyCost: number;
    cooldown: number;
    readyIn: number;
    passive: boolean;
    tags: string[];
    blocker: string | null;
  }[];
  inventory: { id: string; name: string; description: string; type: string; quantity: number; slot: string | null; equipped: boolean; tags: string[]; improvised: boolean }[];
  equipment: { slot: string; itemId: string | null; name: string | null }[];
  relationships: { npcId: string; name: string; mood: string; description: string; axes: { label: string; level: string }[] }[];
  factions: { id: string; name: string; standing: string }[];
  quests: { id: string; title: string; description: string; status: string; objectives: { id: string; description: string; done: boolean; optional: boolean }[] }[];
  knowledge: { id: string; text: string; source: string }[];
  secrets: { id: string; description: string; knownBy: string[] }[];
  journal: { id: string; kind: string; text: string; turn: number }[];
  notes: { id: string; text: string; createdAt: string }[];
  timeline: { id: string; title: string; date: string; status: string; note: string }[];
  divergences: { id: string; turn: number; description: string }[];
  system: {
    enabled: boolean;
    name: string;
    description: string;
    modules: Record<string, boolean>;
    shop: { itemId: string; name: string; price: number; currency: string }[];
    titles: { name: string; description: string; owned: boolean }[];
    achievements: { name: string; description: string; owned: boolean }[];
  };
}

const SLOT_LABELS: Record<string, string> = { weapon: "Оружие", body: "Тело", accessory: "Аксессуар", head: "Голова", hands: "Руки", feet: "Ноги", offhand: "Вторая рука" };
export const slotLabel = (slot: string) => SLOT_LABELS[slot] ?? slot;

function standing(value: number): string {
  if (value >= 60) return "Союзники";
  if (value >= 20) return "Дружелюбие";
  if (value > -20) return "Нейтралитет";
  if (value > -60) return "Недоверие";
  return "Вражда";
}

function remaining(state: GameState, expiresAt: number | undefined): string | null {
  if (expiresAt === undefined) return null;
  const minutes = Math.max(0, expiresAt - state.clock);
  if (minutes < 60) return `${minutes} мин`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)} ч`;
  return `${Math.round(minutes / 1440)} дн`;
}

export function buildPlayerView(scenario: Scenario, state: GameState): PlayerView {
  const npcName = (id: string) => scenario.npcs.find((n) => n.id === id)?.name ?? id;
  const location = scenario.locations.find((l) => l.id === state.player.locationId);
  const stats = effectiveStats(state, scenario);
  const categoryLabel = (id: string) => scenario.mechanics.abilityCategories.find((c) => c.id === id)?.label ?? id;
  const equippedIds = new Set(Object.values(state.player.equipment));
  const presentIds = new Set(presentNpcIds(state));

  const fields = scenario.characterCreation.fields
    .filter((f) => f.id !== "name")
    .map((f) => {
      const raw = state.player.fields[f.id] ?? "";
      const value = f.type === "select" ? (f.options.find((o) => o.value === raw)?.label ?? raw) : raw;
      return { label: f.label, value };
    })
    .filter((f) => f.value.trim().length > 0);

  return {
    scenario: { id: scenario.id, title: scenario.metadata.title, version: scenario.version, authorName: scenario.metadata.authorName },
    turn: state.turn,
    time: formatGameTime(state.time, scenario.calendar),
    alive: state.player.alive,
    scene: { title: state.memory.currentScene.title, arc: state.memory.currentArc.title },
    location: {
      id: location?.id ?? state.player.locationId,
      name: location?.name ?? state.player.locationId,
      description: location?.description ?? "",
      region: location?.region ?? "",
      connections: (location?.connections ?? [])
        .map((c) => ({ c, target: scenario.locations.find((l) => l.id === c.locationId) }))
        .filter(({ c, target }) => target && (!target.hidden || state.locations[c.locationId]?.discovered))
        .map(({ c, target }) => ({ id: c.locationId, name: target?.name ?? c.locationId, minutes: c.travelMinutes })),
    },
    present: [...presentIds].map((id) => ({ id, name: state.npcs[id]?.met ? npcName(id) : "Незнакомец", mood: state.npcs[id]?.mood ?? "", known: state.npcs[id]?.met ?? false })),
    player: {
      name: state.player.name,
      fields,
      level: state.player.level,
      xp: state.player.xp,
      xpToNext: xpToNextLevel(scenario.system, state.player.level),
      skillPoints: state.player.skillPoints,
      attributePoints: state.player.attributePoints,
      resources: Object.entries(state.player.resources).map(([id, pool]) => ({
        id,
        name: scenario.mechanics.stats.find((s) => s.id === id)?.name ?? id,
        current: Math.round(pool.current),
        max: Math.round(pool.max),
      })),
      stats: scenario.mechanics.stats
        .filter((s) => s.kind === "attribute")
        .map((s) => ({ id: s.id, name: s.name, description: s.description, value: stats[s.id] ?? s.default, base: state.player.stats[s.id] ?? s.default })),
      currency: Object.entries(state.player.currency).map(([id, amount]) => ({ id, name: scenario.system.currencies.find((c) => c.id === id)?.name ?? id, amount })),
      effects: state.player.activeEffects.map((e) => ({ id: e.id, name: e.name, description: e.description, remaining: remaining(state, e.expiresAt) })),
      titles: state.player.titles,
      achievements: state.player.achievements.map((id) => scenario.system.achievements.find((a) => a.id === id)?.name ?? id),
    },
    abilityCategories: scenario.mechanics.abilityCategories,
    abilities: state.player.abilities.flatMap((owned) => {
      const a = scenario.abilities.find((x) => x.id === owned.abilityId);
      if (!a) return [];
      return [
        {
          id: a.id,
          name: a.name,
          description: a.description,
          category: a.category,
          categoryLabel: categoryLabel(a.category),
          mastery: Math.round(owned.mastery),
          difficulty: a.difficulty,
          energyCost: a.energyCost,
          cooldown: a.cooldown,
          readyIn: Math.max(0, owned.readyAt - state.clock),
          passive: a.passive,
          tags: a.tags,
          blocker: abilityBlocker(state, scenario, a.id),
        },
      ];
    }),
    inventory: state.player.inventory.flatMap((entry) => {
      const item = findItem(scenario, entry.itemId, state);
      if (!item) return [];
      return [
        {
          id: item.id,
          name: item.name,
          description: item.description,
          type: item.type,
          quantity: entry.quantity,
          slot: item.slot ?? null,
          equipped: equippedIds.has(item.id),
          tags: item.tags,
          improvised: item.id.startsWith("custom-"),
        },
      ];
    }),
    equipment: scenario.mechanics.equipmentSlots.map((slot) => {
      const itemId = state.player.equipment[slot] ?? null;
      return { slot, itemId, name: itemId ? (findItem(scenario, itemId, state)?.name ?? itemId) : null };
    }),
    relationships: scenario.npcs
      .filter((npc) => state.npcs[npc.id]?.met)
      .map((npc) => {
        const npcState = state.npcs[npc.id]!;
        return {
          npcId: npc.id,
          name: npc.name,
          mood: npcState.alive ? npcState.mood : "погиб(ла)",
          description: npc.description,
          axes: describeRelationship(scenario, npcState).map((r) => ({ label: r.label, level: r.level })),
        };
      }),
    factions: scenario.factions.map((f) => ({ id: f.id, name: f.name, standing: standing(state.factions[f.id]?.reputation ?? f.startingReputation) })),
    quests: scenario.quests
      .filter((q) => (state.quests[q.id]?.status ?? "inactive") !== "inactive")
      .map((q) => {
        const qs = state.quests[q.id]!;
        return {
          id: q.id,
          title: q.title,
          description: q.description,
          status: qs.status,
          objectives: q.objectives.map((o) => ({ id: o.id, description: o.description, done: qs.objectives[o.id] === true, optional: o.optional })),
        };
      }),
    knowledge: state.player.knowledge.map((k) => ({ id: k.id, text: k.text, source: k.source })),
    secrets: state.player.secrets.map((s) => ({ id: s.id, description: s.description, knownBy: s.knownByNpcIds.map(npcName) })),
    journal: [...state.journal.entries].reverse().map((e) => ({ id: e.id, kind: e.kind, text: e.text, turn: e.turn })),
    notes: state.journal.notes,
    timeline: timelineView(state, scenario)
      .filter((t) => !t.event.hidden || t.status !== "pending")
      .map((t) => ({ id: t.event.id, title: t.event.title, date: formatTimelineDate(t.event.date, scenario.calendar), status: t.status, note: t.note })),
    divergences: state.divergences.map((d) => ({ id: d.id, turn: d.turn, description: d.description })),
    system: {
      enabled: scenario.system.enabled,
      name: scenario.system.name,
      description: scenario.system.description,
      modules: { ...scenario.system.modules },
      shop: scenario.system.modules.shop
        ? scenario.system.shop.map((s) => ({
            itemId: s.itemId,
            name: findItem(scenario, s.itemId)?.name ?? s.itemId,
            price: s.price,
            currency: scenario.system.currencies.find((c) => c.id === s.currencyId)?.name ?? s.currencyId,
          }))
        : [],
      titles: scenario.system.titles.map((t) => ({ name: t.name, description: t.description, owned: state.player.titles.includes(t.name) || state.player.titles.includes(t.id) })),
      achievements: scenario.system.achievements
        .filter((a) => !a.hidden || state.player.achievements.includes(a.id))
        .map((a) => ({ name: a.name, description: a.description, owned: state.player.achievements.includes(a.id) })),
    },
  };
}
