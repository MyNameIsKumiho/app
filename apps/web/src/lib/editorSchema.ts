import type { Scenario } from "@aetherfall/core";

/**
 * Declarative description of the advanced editor. Every section and
 * collection form is rendered from these specs, so adding a field to the
 * scenario format means adding one line here.
 */

export type RefCollection = "locations" | "npcs" | "factions" | "abilities" | "items" | "quests" | "lore" | "timeline";

export type FieldSpec =
  | { type: "text" | "textarea"; key: string; label: string; ai?: boolean; placeholder?: string; hint?: string }
  | { type: "number"; key: string; label: string; min?: number; max?: number; hint?: string }
  | { type: "bool"; key: string; label: string; hint?: string }
  | { type: "select"; key: string; label: string; options: { value: string; label: string }[]; hint?: string }
  | { type: "tags" | "lines"; key: string; label: string; hint?: string }
  | { type: "ref"; key: string; label: string; ref: RefCollection | "abilityCategories"; optional?: boolean }
  | { type: "refs"; key: string; label: string; ref: RefCollection }
  | { type: "json"; key: string; label: string; hint?: string }
  | { type: "objlist"; key: string; label: string; fields: FieldSpec[]; newItem: () => Record<string, unknown>; titleKey?: string };

const opts = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
const LEVEL4 = opts([["none", "Нет"], ["low", "Низкий"], ["medium", "Средний"], ["high", "Высокий"]]);
const AI_TEXT = (key: string, label: string, hint?: string): FieldSpec => ({ type: "textarea", key, label, ai: true, hint });

export interface SectionSpec {
  id: string;
  label: string;
  /** Plain form over the scenario object... */
  fields?: FieldSpec[];
  /** ...or a list of entities. */
  collection?: { key: RefCollection; itemLabel: string; nameKey: "name" | "title"; fields: FieldSpec[]; newItem: (id: string, name: string) => Record<string, unknown> };
}

const EFFECTS_HINT = 'Механические эффекты, например [{"type":"resource","resourceId":"health","amount":20}]. Типы: resource, stat, status, flag.';
const CONDITIONS_HINT = 'Например [{"type":"flag","key":"archive_secured","equals":false}]. Типы: flag, npc_alive, quest_status, player_at, relationship_at_least.';

export const SECTIONS: SectionSpec[] = [
  {
    id: "general",
    label: "Основное",
    fields: [
      { type: "text", key: "metadata.title", label: "Название" },
      AI_TEXT("metadata.shortDescription", "Краткое описание", "Показывается в каталоге"),
      AI_TEXT("metadata.fullDescription", "Полное описание"),
      { type: "text", key: "metadata.authorName", label: "Автор" },
      { type: "select", key: "metadata.origin", label: "Тип мира", options: opts([["original", "Оригинальный"], ["fan", "Фанфик по существующему произведению"]]) },
      { type: "text", key: "metadata.fandom", label: "Фандом (для фанфиков)" },
      { type: "text", key: "metadata.coverImage", label: "Обложка (URL изображения)" },
      { type: "bool", key: "metadata.allowRemix", label: "Разрешить ремиксы", hint: "Другие смогут сделать свою версию с указанием вашего авторства" },
      { type: "tags", key: "tags.genre", label: "Жанры" },
      { type: "tags", key: "tags.setting", label: "Сеттинг" },
      { type: "tags", key: "tags.tone", label: "Тон" },
      { type: "tags", key: "tags.themes", label: "Темы" },
      { type: "tags", key: "tags.features", label: "Особенности" },
      { type: "tags", key: "tags.content", label: "Предупреждения о контенте" },
    ],
  },
  {
    id: "world",
    label: "Мир",
    fields: [
      { type: "text", key: "world.name", label: "Название мира" },
      AI_TEXT("world.description", "Описание мира"),
      AI_TEXT("world.history", "История"),
      AI_TEXT("world.geography", "География"),
      AI_TEXT("world.technologyLevel", "Уровень технологий"),
      AI_TEXT("world.magicSystem", "Магия"),
      AI_TEXT("world.powerSystem", "Система силы"),
      AI_TEXT("world.politics", "Политика"),
      AI_TEXT("world.economy", "Экономика"),
      AI_TEXT("world.culture", "Культура"),
      AI_TEXT("world.religion", "Религия"),
      { type: "lines", key: "world.importantRules", label: "Незыблемые правила мира", hint: "По одному правилу на строку" },
      { type: "lines", key: "calendar.monthNames", label: "Месяцы календаря", hint: "По одному на строку" },
      { type: "number", key: "calendar.daysPerMonth", label: "Дней в месяце", min: 1, max: 100 },
      { type: "text", key: "calendar.yearLabel", label: "Как называется год" },
    ],
  },
  {
    id: "start",
    label: "Старт",
    fields: [
      { type: "ref", key: "start.locationId", label: "Стартовая локация", ref: "locations" },
      { type: "number", key: "start.date.year", label: "Год", min: 0 },
      { type: "number", key: "start.date.month", label: "Месяц", min: 1 },
      { type: "number", key: "start.date.day", label: "День", min: 1 },
      { type: "number", key: "start.date.hour", label: "Час", min: 0, max: 47 },
      AI_TEXT("start.situation", "Стартовая ситуация"),
      AI_TEXT("start.openingScene", "Вступительная сцена", "Первый текст, который увидит игрок"),
      { type: "text", key: "start.playerAge", label: "Возраст героя" },
      AI_TEXT("start.playerBackground", "Предыстория героя"),
      { type: "select", key: "start.playerKnowledge", label: "Знает ли герой сюжет мира?", options: opts([["none", "Нет"], ["partial", "Частично"], ["full", "Полностью"]]) },
      { type: "lines", key: "start.knownFacts", label: "Что герой знает заранее", hint: "По факту на строку" },
      { type: "refs", key: "start.activeQuestIds", label: "Задания на старте", ref: "quests" },
      {
        type: "objlist",
        key: "start.playerSecrets",
        label: "Секреты героя",
        titleKey: "description",
        newItem: () => ({ id: `secret-${Date.now().toString(36)}`, description: "", keywords: [], knownByNpcIds: [], importance: 70 }),
        fields: [
          { type: "text", key: "description", label: "Секрет" },
          { type: "tags", key: "keywords", label: "Ключевые слова утечки" },
          { type: "number", key: "importance", label: "Важность (0–100)", min: 0, max: 100 },
        ],
      },
      { type: "json", key: "start.flags", label: "Стартовые флаги", hint: 'Например {"archive_secured": false}' },
      { type: "json", key: "start.currency", label: "Стартовые деньги", hint: 'Например {"crowns": 20}' },
    ],
  },
  {
    id: "player",
    label: "Персонаж",
    fields: [
      {
        type: "objlist",
        key: "characterCreation.fields",
        label: "Поля создания персонажа",
        titleKey: "label",
        newItem: () => ({ id: `field-${Date.now().toString(36)}`, label: "Новое поле", type: "text", required: false, placeholder: "", aiHint: "", options: [] }),
        fields: [
          { type: "text", key: "id", label: "Идентификатор" },
          { type: "text", key: "label", label: "Название" },
          { type: "select", key: "type", label: "Тип", options: opts([["text", "Строка"], ["textarea", "Текст"], ["select", "Выбор"], ["number", "Число"]]) },
          { type: "bool", key: "required", label: "Обязательное" },
          { type: "text", key: "placeholder", label: "Подсказка в поле" },
          { type: "text", key: "aiHint", label: "Подсказка для AI-генерации" },
          {
            type: "objlist",
            key: "options",
            label: "Варианты (для типа «Выбор»)",
            titleKey: "label",
            newItem: () => ({ value: `opt-${Date.now().toString(36)}`, label: "Вариант", description: "", grants: { abilityIds: [], items: [], stats: {} } }),
            fields: [
              { type: "text", key: "value", label: "Значение" },
              { type: "text", key: "label", label: "Название" },
              { type: "text", key: "description", label: "Описание" },
              { type: "refs", key: "grants.abilityIds", label: "Даёт способности", ref: "abilities" },
              { type: "json", key: "grants.items", label: "Даёт предметы", hint: '[{"itemId":"mana-potion","quantity":2}]' },
              { type: "json", key: "grants.stats", label: "Бонусы характеристик", hint: '{"intellect": 2}' },
            ],
          },
        ],
      },
      { type: "refs", key: "characterCreation.startingAbilityIds", label: "Стартовые способности", ref: "abilities" },
      { type: "json", key: "characterCreation.startingItems", label: "Стартовые предметы", hint: '[{"itemId":"novice-wand","quantity":1}]' },
      { type: "number", key: "characterCreation.attributePoints", label: "Свободные очки характеристик", min: 0 },
      { type: "lines", key: "characterCreation.specialTraits", label: "Особенности старта" },
      {
        type: "objlist",
        key: "mechanics.stats",
        label: "Характеристики и ресурсы",
        titleKey: "name",
        newItem: () => ({ id: `stat-${Date.now().toString(36)}`, name: "Новая характеристика", description: "", kind: "attribute", min: 0, max: 100, default: 10 }),
        fields: [
          { type: "text", key: "id", label: "Идентификатор" },
          { type: "text", key: "name", label: "Название" },
          { type: "select", key: "kind", label: "Тип", options: opts([["attribute", "Характеристика (число)"], ["resource", "Ресурс (текущее/макс.)"]]) },
          { type: "number", key: "default", label: "Начальное значение" },
          { type: "number", key: "min", label: "Минимум" },
          { type: "number", key: "max", label: "Максимум" },
          { type: "text", key: "description", label: "Описание" },
        ],
      },
      { type: "text", key: "mechanics.healthResourceId", label: "Ресурс здоровья (id)" },
      { type: "text", key: "mechanics.energyResourceId", label: "Ресурс энергии (id)" },
      { type: "tags", key: "mechanics.equipmentSlots", label: "Слоты экипировки" },
      {
        type: "objlist",
        key: "mechanics.abilityCategories",
        label: "Категории способностей",
        titleKey: "label",
        newItem: () => ({ id: `cat-${Date.now().toString(36)}`, label: "Новая категория" }),
        fields: [
          { type: "text", key: "id", label: "Идентификатор" },
          { type: "text", key: "label", label: "Название" },
        ],
      },
      { type: "json", key: "mechanics.relationshipAxes", label: "Оси отношений", hint: "Числа скрыты от игрока: он видит только названия уровней (levels). hiddenFromPlayer прячет ось целиком." },
    ],
  },
  {
    id: "system",
    label: "Система",
    fields: [
      { type: "bool", key: "system.enabled", label: "Включить Систему (игровой интерфейс мира)" },
      { type: "text", key: "system.name", label: "Название" },
      AI_TEXT("system.description", "Описание"),
      AI_TEXT("system.voice", "Как Система говорит с игроком"),
      { type: "bool", key: "system.modules.levels", label: "Уровни" },
      { type: "bool", key: "system.modules.experience", label: "Опыт" },
      { type: "bool", key: "system.modules.skillPoints", label: "Очки навыков" },
      { type: "bool", key: "system.modules.attributePoints", label: "Очки характеристик" },
      { type: "bool", key: "system.modules.quests", label: "Задания" },
      { type: "bool", key: "system.modules.achievements", label: "Достижения" },
      { type: "bool", key: "system.modules.titles", label: "Титулы" },
      { type: "bool", key: "system.modules.shop", label: "Магазин" },
      { type: "bool", key: "system.modules.classes", label: "Классы" },
      { type: "bool", key: "system.modules.dailyQuests", label: "Ежедневные задания" },
      { type: "number", key: "system.xpCurve.base", label: "Опыт до 2 уровня", min: 1 },
      { type: "number", key: "system.xpCurve.growth", label: "Рост требований (множитель)", min: 1 },
      { type: "number", key: "system.maxLevel", label: "Максимальный уровень", min: 1 },
      { type: "number", key: "system.skillPointsPerLevel", label: "Очков навыков за уровень", min: 0 },
      { type: "number", key: "system.attributePointsPerLevel", label: "Очков характеристик за уровень", min: 0 },
      {
        type: "objlist",
        key: "system.currencies",
        label: "Валюты",
        titleKey: "name",
        newItem: () => ({ id: `cur-${Date.now().toString(36)}`, name: "Монеты" }),
        fields: [
          { type: "text", key: "id", label: "Идентификатор" },
          { type: "text", key: "name", label: "Название" },
        ],
      },
      { type: "json", key: "system.shop", label: "Товары магазина", hint: '[{"itemId":"mana-potion","price":10,"currencyId":"crowns"}]' },
      {
        type: "objlist",
        key: "system.achievements",
        label: "Достижения",
        titleKey: "name",
        newItem: () => ({ id: `ach-${Date.now().toString(36)}`, name: "Достижение", description: "", hidden: false }),
        fields: [
          { type: "text", key: "id", label: "Идентификатор" },
          { type: "text", key: "name", label: "Название" },
          { type: "text", key: "description", label: "Описание" },
          { type: "bool", key: "hidden", label: "Скрытое" },
        ],
      },
      {
        type: "objlist",
        key: "system.titles",
        label: "Титулы",
        titleKey: "name",
        newItem: () => ({ id: `title-${Date.now().toString(36)}`, name: "Титул", description: "" }),
        fields: [
          { type: "text", key: "id", label: "Идентификатор" },
          { type: "text", key: "name", label: "Название" },
          { type: "text", key: "description", label: "Описание" },
        ],
      },
      {
        type: "objlist",
        key: "system.classes",
        label: "Классы",
        titleKey: "name",
        newItem: () => ({ id: `class-${Date.now().toString(36)}`, name: "Класс", description: "" }),
        fields: [
          { type: "text", key: "id", label: "Идентификатор" },
          { type: "text", key: "name", label: "Название" },
          { type: "text", key: "description", label: "Описание" },
        ],
      },
      {
        type: "objlist",
        key: "system.customMechanics",
        label: "Свои механики",
        titleKey: "name",
        newItem: () => ({ id: `mech-${Date.now().toString(36)}`, name: "Механика", rules: "" }),
        fields: [
          { type: "text", key: "id", label: "Идентификатор" },
          { type: "text", key: "name", label: "Название" },
          { type: "textarea", key: "rules", label: "Правила", ai: true },
        ],
      },
    ],
  },
  {
    id: "lore",
    label: "Лор",
    collection: {
      key: "lore",
      itemLabel: "Запись лора",
      nameKey: "name",
      newItem: (id, name) => ({ id, name, type: "concept", description: "", tags: [], visibility: "public", aiInstructions: "", relatedIds: [] }),
      fields: [
        { type: "text", key: "name", label: "Название" },
        { type: "select", key: "type", label: "Тип", options: opts([["character", "Персонаж"], ["location", "Место"], ["faction", "Фракция"], ["item", "Предмет"], ["ability", "Способность"], ["race", "Раса"], ["creature", "Существо"], ["historical_event", "Историческое событие"], ["concept", "Понятие"], ["religion", "Религия"], ["technology", "Технология"], ["magic", "Магия"], ["custom", "Другое"]]) },
        AI_TEXT("description", "Описание"),
        { type: "select", key: "visibility", label: "Кто знает", options: opts([["public", "Общеизвестно"], ["hidden", "Малоизвестно"], ["secret", "Тайна"]]) },
        { type: "tags", key: "tags", label: "Теги" },
        AI_TEXT("aiInstructions", "Инструкции для рассказчика"),
      ],
    },
  },
  {
    id: "npcs",
    label: "Персонажи",
    collection: {
      key: "npcs",
      itemLabel: "Персонаж",
      nameKey: "name",
      newItem: (id, name) => ({ id, name, description: "", appearance: "", personality: "", speechStyle: "", goals: [], fears: [], secrets: [], abilityIds: [], relationships: [], factionIds: [], knowledge: [], startingMood: "спокойствие", startingRelationship: {}, importance: "major", aiInstructions: "" }),
      fields: [
        { type: "text", key: "name", label: "Имя" },
        AI_TEXT("description", "Кто это"),
        AI_TEXT("appearance", "Внешность"),
        AI_TEXT("personality", "Характер"),
        { type: "text", key: "speechStyle", label: "Манера речи" },
        { type: "lines", key: "goals", label: "Цели" },
        { type: "lines", key: "fears", label: "Страхи" },
        {
          type: "objlist",
          key: "secrets",
          label: "Секреты",
          titleKey: "description",
          newItem: () => ({ id: `secret-${Date.now().toString(36)}`, description: "", keywords: [], knownByNpcIds: [], importance: 70 }),
          fields: [
            { type: "text", key: "description", label: "Секрет" },
            { type: "tags", key: "keywords", label: "Ключевые слова" },
            { type: "number", key: "importance", label: "Важность (0–100)", min: 0, max: 100 },
          ],
        },
        { type: "lines", key: "knowledge", label: "Что знает на старте", hint: "По факту на строку. NPC не знает того, чего здесь нет." },
        { type: "ref", key: "startingLocationId", label: "Где находится", ref: "locations", optional: true },
        { type: "refs", key: "factionIds", label: "Фракции", ref: "factions" },
        { type: "refs", key: "abilityIds", label: "Способности", ref: "abilities" },
        { type: "text", key: "startingMood", label: "Настроение на старте" },
        { type: "json", key: "startingRelationship", label: "Отношение к герою на старте", hint: '{"trust": 10, "suspicion": 30}' },
        {
          type: "objlist",
          key: "relationships",
          label: "Связи с другими персонажами",
          titleKey: "description",
          newItem: () => ({ targetId: "", description: "" }),
          fields: [
            { type: "ref", key: "targetId", label: "С кем", ref: "npcs" },
            { type: "text", key: "description", label: "Какая связь" },
          ],
        },
        { type: "select", key: "importance", label: "Роль", options: opts([["major", "Важный"], ["minor", "Второстепенный"]]) },
        AI_TEXT("aiInstructions", "Инструкции для рассказчика"),
        { type: "text", key: "visualProfile.hair", label: "Волосы (для иллюстраций)" },
        { type: "text", key: "visualProfile.eyes", label: "Глаза" },
        { type: "text", key: "visualProfile.clothing", label: "Одежда" },
        { type: "text", key: "visualProfile.distinctiveFeatures", label: "Особые приметы" },
      ],
    },
  },
  {
    id: "factions",
    label: "Фракции",
    collection: {
      key: "factions",
      itemLabel: "Фракция",
      nameKey: "name",
      newItem: (id, name) => ({ id, name, description: "", memberIds: [], goals: [], enemyIds: [], allyIds: [], territory: "", startingReputation: 0 }),
      fields: [
        { type: "text", key: "name", label: "Название" },
        AI_TEXT("description", "Описание"),
        { type: "ref", key: "leaderId", label: "Лидер", ref: "npcs", optional: true },
        { type: "refs", key: "memberIds", label: "Участники", ref: "npcs" },
        { type: "lines", key: "goals", label: "Цели" },
        { type: "refs", key: "allyIds", label: "Союзники", ref: "factions" },
        { type: "refs", key: "enemyIds", label: "Враги", ref: "factions" },
        { type: "text", key: "territory", label: "Территория" },
        { type: "number", key: "startingReputation", label: "Репутация героя на старте (−100…100)", min: -100, max: 100 },
      ],
    },
  },
  {
    id: "locations",
    label: "Локации",
    collection: {
      key: "locations",
      itemLabel: "Локация",
      nameKey: "name",
      newItem: (id, name) => ({ id, name, description: "", region: "", connections: [], tags: [], hidden: false, visualDescription: "" }),
      fields: [
        { type: "text", key: "name", label: "Название" },
        AI_TEXT("description", "Описание"),
        { type: "text", key: "region", label: "Регион" },
        {
          type: "objlist",
          key: "connections",
          label: "Пути отсюда",
          titleKey: "locationId",
          newItem: () => ({ locationId: "", travelMinutes: 10 }),
          fields: [
            { type: "ref", key: "locationId", label: "Куда", ref: "locations" },
            { type: "number", key: "travelMinutes", label: "Минут в пути", min: 0 },
          ],
        },
        { type: "bool", key: "hidden", label: "Скрытая (откроется по ходу истории)" },
        { type: "tags", key: "tags", label: "Теги" },
        { type: "textarea", key: "visualDescription", label: "Как выглядит (для иллюстраций)" },
      ],
    },
  },
  {
    id: "abilities",
    label: "Способности",
    collection: {
      key: "abilities",
      itemLabel: "Способность",
      nameKey: "name",
      newItem: (id, name) => ({ id, name, description: "", category: "special", subcategory: "", difficulty: 3, mastery: 10, energyCost: 0, cooldown: 0, requirements: { stats: {}, abilityIds: [], itemIds: [], flags: [] }, effects: [], tags: [], hidden: false, passive: false, metadata: {} }),
      fields: [
        { type: "text", key: "name", label: "Название" },
        AI_TEXT("description", "Описание"),
        { type: "ref", key: "category", label: "Категория", ref: "abilityCategories" },
        { type: "text", key: "subcategory", label: "Подкатегория" },
        { type: "number", key: "difficulty", label: "Сложность (1–10)", min: 1, max: 10 },
        { type: "number", key: "mastery", label: "Начальное мастерство (0–100)", min: 0, max: 100 },
        { type: "number", key: "energyCost", label: "Стоимость энергии", min: 0 },
        { type: "number", key: "cooldown", label: "Перезарядка (минут игрового времени)", min: 0 },
        { type: "number", key: "requirements.minLevel", label: "Минимальный уровень", min: 0 },
        { type: "json", key: "requirements.stats", label: "Требования к характеристикам", hint: '{"intellect": 12}' },
        { type: "refs", key: "requirements.abilityIds", label: "Требует способности", ref: "abilities" },
        { type: "refs", key: "requirements.itemIds", label: "Требует предметы", ref: "items" },
        { type: "json", key: "effects", label: "Эффекты", hint: EFFECTS_HINT },
        { type: "bool", key: "passive", label: "Пассивная" },
        { type: "bool", key: "hidden", label: "Скрытая" },
        { type: "tags", key: "tags", label: "Теги" },
      ],
    },
  },
  {
    id: "items",
    label: "Предметы",
    collection: {
      key: "items",
      itemLabel: "Предмет",
      nameKey: "name",
      newItem: (id, name) => ({ id, name, description: "", type: "misc", effects: [], value: 0, stackable: true, tags: [], hidden: false, visualDescription: "" }),
      fields: [
        { type: "text", key: "name", label: "Название" },
        AI_TEXT("description", "Описание"),
        { type: "select", key: "type", label: "Тип", options: opts([["consumable", "Расходуемый"], ["equipment", "Снаряжение"], ["key", "Ключевой"], ["material", "Материал"], ["misc", "Разное"]]) },
        { type: "text", key: "slot", label: "Слот (для снаряжения)", hint: "Один из слотов экипировки, например weapon" },
        { type: "json", key: "effects", label: "Эффекты", hint: EFFECTS_HINT },
        { type: "number", key: "value", label: "Ценность", min: 0 },
        { type: "bool", key: "stackable", label: "Складывается в стопку" },
        { type: "bool", key: "hidden", label: "Скрытый" },
        { type: "tags", key: "tags", label: "Теги" },
      ],
    },
  },
  {
    id: "quests",
    label: "Задания",
    collection: {
      key: "quests",
      itemLabel: "Задание",
      nameKey: "title",
      newItem: (id, name) => ({ id, title: name, description: "", objectives: [], rewards: { xp: 0, items: [], currency: {} }, hidden: false, daily: false }),
      fields: [
        { type: "text", key: "title", label: "Название" },
        AI_TEXT("description", "Описание"),
        {
          type: "objlist",
          key: "objectives",
          label: "Цели",
          titleKey: "description",
          newItem: () => ({ id: `obj-${Date.now().toString(36)}`, description: "", optional: false }),
          fields: [
            { type: "text", key: "id", label: "Идентификатор" },
            { type: "text", key: "description", label: "Что сделать" },
            { type: "bool", key: "optional", label: "Необязательная" },
          ],
        },
        { type: "ref", key: "giverNpcId", label: "Кто выдаёт", ref: "npcs", optional: true },
        { type: "number", key: "rewards.xp", label: "Награда: опыт", min: 0 },
        { type: "json", key: "rewards.items", label: "Награда: предметы", hint: '[{"itemId":"mana-potion","quantity":1}]' },
        { type: "json", key: "rewards.currency", label: "Награда: деньги", hint: '{"crowns": 50}' },
        { type: "bool", key: "hidden", label: "Скрытое" },
      ],
    },
  },
  {
    id: "timeline",
    label: "Хронология",
    collection: {
      key: "timeline",
      itemLabel: "Событие",
      nameKey: "title",
      newItem: (id, name) => ({ id, title: name, date: { year: 1 }, conditions: [], participants: [], description: "", importance: 50, mutable: true, hidden: false, effects: [], outcome: "" }),
      fields: [
        { type: "text", key: "title", label: "Название" },
        { type: "number", key: "date.year", label: "Год", min: 0 },
        { type: "number", key: "date.month", label: "Месяц", min: 1 },
        { type: "number", key: "date.day", label: "День", min: 1 },
        { type: "number", key: "date.hour", label: "Час", min: 0 },
        AI_TEXT("description", "Что происходит"),
        { type: "ref", key: "locationId", label: "Где", ref: "locations", optional: true },
        { type: "refs", key: "participants", label: "Участники", ref: "npcs" },
        { type: "bool", key: "mutable", label: "Игрок может изменить это событие", hint: "Неизменяемые события срываются, только если они стали невозможны (например, участник погиб)" },
        { type: "json", key: "conditions", label: "Условия", hint: CONDITIONS_HINT },
        { type: "json", key: "effects", label: "Последствия", hint: EFFECTS_HINT },
        { type: "text", key: "outcome", label: "Факт о мире после события" },
        { type: "number", key: "importance", label: "Важность (0–100)", min: 0, max: 100 },
        { type: "bool", key: "hidden", label: "Скрыто от игрока" },
      ],
    },
  },
  {
    id: "rules",
    label: "Правила AI",
    fields: [
      { type: "text", key: "rules.tone", label: "Тон истории" },
      { type: "text", key: "rules.narrativeStyle", label: "Стиль повествования" },
      { type: "select", key: "rules.responseLength", label: "Длина ответов", options: opts([["short", "Короткие"], ["medium", "Средние"], ["long", "Длинные"]]) },
      { type: "select", key: "rules.pov", label: "Повествование", options: opts([["second", "От второго лица (ты)"], ["first", "От первого лица (я)"], ["third", "От третьего лица"]]) },
      { type: "select", key: "rules.difficulty", label: "Сложность", options: opts([["story", "Сюжетная"], ["normal", "Обычная"], ["hard", "Сложная"], ["brutal", "Беспощадная"]]) },
      { type: "select", key: "rules.violence", label: "Насилие", options: LEVEL4 },
      { type: "select", key: "rules.romance", label: "Романтика", options: LEVEL4 },
      { type: "select", key: "rules.comedy", label: "Юмор", options: LEVEL4 },
      { type: "select", key: "rules.canonStrictness", label: "Насколько строго держаться канона", options: opts([["loose", "Свободно"], ["balanced", "Сбалансированно"], ["strict", "Строго"]]) },
      { type: "select", key: "rules.playerFreedom", label: "Свобода игрока", options: opts([["guided", "Ведомый сюжет"], ["open", "Открытый мир"], ["sandbox", "Песочница"]]) },
      { type: "select", key: "rules.npcAutonomy", label: "Самостоятельность NPC", options: LEVEL4 },
      { type: "select", key: "rules.worldLethality", label: "Опасность мира", options: LEVEL4 },
      { type: "bool", key: "rules.playerCanDie", label: "Герой может погибнуть" },
      { type: "select", key: "rules.progressionSpeed", label: "Скорость развития", options: opts([["slow", "Медленная"], ["normal", "Обычная"], ["fast", "Быстрая"]]) },
      { type: "select", key: "rules.worldReactivity", label: "Мир", options: opts([["static", "Статичный"], ["reactive", "Реагирует на героя"], ["living", "Живёт своей жизнью"]]) },
      AI_TEXT("rules.customInstructions", "Дополнительные указания рассказчику"),
      { type: "lines", key: "storyHooks", label: "Сюжетные зацепки", hint: "Идеи, которые рассказчик может вплетать в историю" },
    ],
  },
];

export function sectionOf(issueSection: string): string {
  return SECTIONS.some((s) => s.id === issueSection) ? issueSection : "general";
}

export function refOptions(scenario: Scenario, ref: RefCollection | "abilityCategories"): { value: string; label: string }[] {
  if (ref === "abilityCategories") return scenario.mechanics.abilityCategories.map((c) => ({ value: c.id, label: c.label }));
  const list = scenario[ref] as { id: string; name?: string; title?: string }[];
  return list.map((x) => ({ value: x.id, label: x.name ?? x.title ?? x.id }));
}
