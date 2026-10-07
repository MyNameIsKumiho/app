import type { Scenario } from "../domain/scenario";
import { timelineDateToMinutes, toMinutes } from "../domain/time";

export type IssueLevel = "error" | "warning" | "suggestion";

export interface ValidationIssue {
  level: IssueLevel;
  code: string;
  message: string;
  /** Editor section to jump to. */
  section: "general" | "world" | "start" | "player" | "system" | "lore" | "npcs" | "factions" | "locations" | "abilities" | "items" | "quests" | "timeline" | "rules";
}

export interface ValidationReport {
  issues: ValidationIssue[];
  /** Errors block publishing only when the scenario cannot technically start. */
  canPublish: boolean;
  canPlay: boolean;
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

/** Pre-publish check: missing data, broken references, duplicates, contradictions. */
export function validateScenario(scenario: Scenario): ValidationReport {
  const issues: ValidationIssue[] = [];
  const add = (level: IssueLevel, section: ValidationIssue["section"], code: string, message: string) => issues.push({ level, section, code, message });

  const locationIds = new Set(scenario.locations.map((l) => l.id));
  const npcIds = new Set(scenario.npcs.map((n) => n.id));
  const abilityIds = new Set(scenario.abilities.map((a) => a.id));
  const itemIds = new Set(scenario.items.map((i) => i.id));
  const questIds = new Set(scenario.quests.map((q) => q.id));
  const factionIds = new Set(scenario.factions.map((f) => f.id));
  const statIds = new Set(scenario.mechanics.stats.map((s) => s.id));
  const categoryIds = new Set(scenario.mechanics.abilityCategories.map((c) => c.id));
  const axisIds = new Set(scenario.mechanics.relationshipAxes.map((a) => a.id));

  // Missing required data
  if (!scenario.metadata.title.trim()) add("error", "general", "missing_title", "Нет названия.");
  if (!scenario.metadata.shortDescription.trim()) add("warning", "general", "missing_description", "Нет краткого описания — игрокам будет сложно выбрать сценарий.");
  if (scenario.locations.length === 0) add("error", "locations", "no_locations", "Нужна хотя бы одна локация.");
  if (!locationIds.has(scenario.start.locationId)) add("error", "start", "bad_start_location", `Стартовая локация «${scenario.start.locationId}» не существует.`);
  if (!scenario.start.situation.trim() && !scenario.start.openingScene.trim()) add("warning", "start", "missing_situation", "Не описана стартовая ситуация.");
  if (!scenario.world.description.trim()) add("warning", "world", "missing_world", "Мир не описан — рассказчику не на что опереться.");
  if (!scenario.characterCreation.fields.some((f) => f.id === "name")) add("error", "player", "no_name_field", "В создании персонажа нет поля «Имя».");

  // Duplicate IDs
  const collections: [ValidationIssue["section"], string[]][] = [
    ["locations", scenario.locations.map((x) => x.id)],
    ["npcs", scenario.npcs.map((x) => x.id)],
    ["abilities", scenario.abilities.map((x) => x.id)],
    ["items", scenario.items.map((x) => x.id)],
    ["quests", scenario.quests.map((x) => x.id)],
    ["factions", scenario.factions.map((x) => x.id)],
    ["lore", scenario.lore.map((x) => x.id)],
    ["timeline", scenario.timeline.map((x) => x.id)],
  ];
  for (const [section, ids] of collections) {
    for (const id of duplicates(ids)) add("error", section, "duplicate_id", `Повторяющийся id «${id}».`);
  }

  // Broken references
  for (const loc of scenario.locations) {
    for (const c of loc.connections) if (!locationIds.has(c.locationId)) add("warning", "locations", "broken_connection", `Локация «${loc.name}» ведёт в несуществующую «${c.locationId}».`);
    if (loc.connections.length === 0 && scenario.locations.length > 1) add("suggestion", "locations", "isolated_location", `Локация «${loc.name}» ни с чем не связана — в неё можно попасть только по сюжету.`);
  }
  for (const npc of scenario.npcs) {
    if (npc.startingLocationId && !locationIds.has(npc.startingLocationId)) add("warning", "npcs", "npc_bad_location", `${npc.name}: несуществующая стартовая локация.`);
    for (const id of npc.abilityIds) if (!abilityIds.has(id)) add("warning", "npcs", "npc_undefined_ability", `${npc.name}: способность «${id}» не определена.`);
    for (const id of npc.factionIds) if (!factionIds.has(id)) add("warning", "npcs", "npc_bad_faction", `${npc.name}: фракция «${id}» не определена.`);
    for (const axis of Object.keys(npc.startingRelationship)) if (!axisIds.has(axis)) add("warning", "npcs", "npc_bad_axis", `${npc.name}: неизвестный параметр отношений «${axis}».`);
    if (!npc.personality.trim()) add("suggestion", "npcs", "npc_no_personality", `${npc.name}: не описан характер — NPC будет безликим.`);
  }
  for (const f of scenario.factions) {
    if (f.leaderId && !npcIds.has(f.leaderId)) add("warning", "factions", "faction_bad_leader", `${f.name}: лидер «${f.leaderId}» не найден среди NPC.`);
    for (const id of f.memberIds) if (!npcIds.has(id)) add("warning", "factions", "faction_bad_member", `${f.name}: участник «${id}» не найден.`);
    for (const id of [...f.allyIds, ...f.enemyIds]) if (!factionIds.has(id)) add("warning", "factions", "faction_bad_relation", `${f.name}: фракция «${id}» не определена.`);
    const both = f.allyIds.filter((id) => f.enemyIds.includes(id));
    for (const id of both) add("warning", "factions", "ally_and_enemy", `${f.name}: «${id}» одновременно союзник и враг.`);
  }
  for (const a of scenario.abilities) {
    if (!categoryIds.has(a.category)) add("warning", "abilities", "unknown_category", `${a.name}: категория «${a.category}» не определена в механиках.`);
    for (const id of a.requirements.abilityIds) if (!abilityIds.has(id)) add("warning", "abilities", "undefined_ability_requirement", `${a.name}: требует неизвестную способность «${id}».`);
    for (const id of a.requirements.itemIds) if (!itemIds.has(id)) add("warning", "abilities", "undefined_item_requirement", `${a.name}: требует неизвестный предмет «${id}».`);
    for (const statId of Object.keys(a.requirements.stats)) if (!statIds.has(statId)) add("warning", "abilities", "undefined_stat", `${a.name}: неизвестная характеристика «${statId}».`);
    for (const e of a.effects) if (e.type === "resource" && !statIds.has(e.resourceId)) add("warning", "abilities", "undefined_resource", `${a.name}: эффект на неизвестный ресурс «${e.resourceId}».`);
  }
  for (const id of scenario.characterCreation.startingAbilityIds) if (!abilityIds.has(id)) add("error", "player", "undefined_starting_ability", `Стартовая способность «${id}» не определена.`);
  for (const it of scenario.characterCreation.startingItems) if (!itemIds.has(it.itemId)) add("error", "player", "undefined_starting_item", `Стартовый предмет «${it.itemId}» не определён.`);
  for (const field of scenario.characterCreation.fields) {
    if (field.type === "select" && field.options.length === 0) add("error", "player", "empty_select", `Поле «${field.label}»: нет вариантов выбора.`);
    for (const option of field.options) {
      for (const id of option.grants.abilityIds) if (!abilityIds.has(id)) add("warning", "player", "undefined_grant", `«${field.label}/${option.label}»: способность «${id}» не определена.`);
      for (const it of option.grants.items) if (!itemIds.has(it.itemId)) add("warning", "player", "undefined_grant", `«${field.label}/${option.label}»: предмет «${it.itemId}» не определён.`);
    }
  }
  for (const id of scenario.start.activeQuestIds) if (!questIds.has(id)) add("warning", "start", "undefined_quest", `Стартовый квест «${id}» не определён.`);
  for (const q of scenario.quests) {
    if (q.giverNpcId && !npcIds.has(q.giverNpcId)) add("warning", "quests", "quest_bad_giver", `${q.title}: NPC «${q.giverNpcId}» не найден.`);
    if (q.objectives.length === 0) add("suggestion", "quests", "quest_no_objectives", `${q.title}: нет целей — квест нельзя будет выполнить по шагам.`);
    for (const r of q.rewards.items) if (!itemIds.has(r.itemId)) add("warning", "quests", "quest_bad_reward", `${q.title}: награда «${r.itemId}» не определена.`);
  }

  // Timeline contradictions
  const startMinutes = toMinutes(scenario.start.date, scenario.calendar);
  for (const e of scenario.timeline) {
    if (e.locationId && !locationIds.has(e.locationId)) add("warning", "timeline", "event_bad_location", `${e.title}: локация «${e.locationId}» не найдена.`);
    for (const p of e.participants) if (!npcIds.has(p)) add("warning", "timeline", "event_undefined_npc", `${e.title}: участник «${p}» не определён.`);
    for (const c of e.conditions) {
      if (c.type === "npc_alive" && !npcIds.has(c.npcId)) add("warning", "timeline", "condition_undefined_npc", `${e.title}: условие ссылается на неизвестного NPC «${c.npcId}».`);
      if (c.type === "quest_status" && !questIds.has(c.questId)) add("warning", "timeline", "condition_undefined_quest", `${e.title}: условие ссылается на неизвестный квест.`);
    }
    if (e.date.month !== undefined && e.date.month > scenario.calendar.monthNames.length) add("error", "timeline", "bad_month", `${e.title}: месяц ${e.date.month} не существует в календаре.`);
    if (e.date.day !== undefined && e.date.day > scenario.calendar.daysPerMonth) add("error", "timeline", "bad_day", `${e.title}: день ${e.date.day} больше длины месяца.`);
    if (timelineDateToMinutes(e.date, scenario.calendar) < startMinutes) add("warning", "timeline", "event_before_start", `${e.title}: событие раньше старта истории — оно сразу будет считаться прошедшим.`);
  }
  if (scenario.start.date.month > scenario.calendar.monthNames.length || scenario.start.date.day > scenario.calendar.daysPerMonth) {
    add("error", "start", "impossible_start_date", "Стартовая дата не существует в календаре сценария.");
  }

  // Impossible starting conditions / system contradictions
  const energy = scenario.mechanics.stats.find((s) => s.id === scenario.mechanics.energyResourceId);
  const startAbilities = scenario.abilities.filter((a) => scenario.characterCreation.startingAbilityIds.includes(a.id));
  for (const a of startAbilities) {
    if (a.energyCost > 0 && !energy) add("warning", "system", "no_energy_resource", `«${a.name}» тратит ресурс, но ресурса «${scenario.mechanics.energyResourceId}» нет в характеристиках.`);
    else if (energy && a.energyCost > energy.default) add("warning", "player", "unaffordable_start_ability", `«${a.name}» стоит ${a.energyCost}, а у героя на старте максимум ${energy.default}.`);
    if (a.requirements.minLevel !== undefined && a.requirements.minLevel > 1) add("suggestion", "player", "locked_start_ability", `«${a.name}» требует уровень ${a.requirements.minLevel} — на старте её нельзя использовать.`);
  }
  if (!scenario.system.enabled && (scenario.system.achievements.length > 0 || scenario.system.shop.length > 0)) add("warning", "system", "system_disabled_with_content", "Система выключена, но в ней настроены достижения или магазин.");
  if (scenario.system.enabled && scenario.system.modules.shop && scenario.system.shop.length === 0) add("suggestion", "system", "empty_shop", "Магазин включён, но пуст.");
  for (const entry of scenario.system.shop) {
    if (!itemIds.has(entry.itemId)) add("warning", "system", "shop_bad_item", `Магазин: предмет «${entry.itemId}» не определён.`);
    if (!scenario.system.currencies.some((c) => c.id === entry.currencyId)) add("warning", "system", "shop_bad_currency", `Магазин: валюта «${entry.currencyId}» не определена.`);
  }
  if (scenario.start.playerKnowledge !== "none" && scenario.start.knownFacts.length === 0) add("suggestion", "start", "knowledge_without_facts", "Герой знает оригинальную историю, но не указано, что именно он знает.");
  if (!scenario.rules.playerCanDie && scenario.rules.worldLethality === "high") add("suggestion", "rules", "lethal_but_immortal", "Мир очень опасен, но герой не может умереть — рассказчик будет заменять смерть тяжёлыми последствиями.");

  // Missing AI instructions
  if (!scenario.rules.tone.trim() || !scenario.rules.narrativeStyle.trim()) add("warning", "rules", "missing_ai_style", "Не задан тон или стиль повествования.");
  if (scenario.npcs.filter((n) => n.importance === "major").length === 0) add("suggestion", "npcs", "no_major_npcs", "Нет ключевых NPC — истории будет не хватать живых персонажей.");
  if (scenario.storyHooks.length === 0) add("suggestion", "general", "no_hooks", "Добавьте сюжетные зацепки — они помогут рассказчику.");

  const blocking = issues.filter((i) => i.level === "error");
  return { issues, canPublish: blocking.length === 0, canPlay: blocking.length === 0 };
}
