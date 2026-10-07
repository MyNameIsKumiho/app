import type { Scenario, ScenarioInput } from "../../../domain/scenario";
import { slugify } from "../../../domain/common";
import type { ScenarioPatch } from "../../../creator/patch";
import { validateScenario } from "../../../scenario/validator";
import type { FieldAction } from "../../../creator/fieldActions";
import type { AIReview, AssistantResult, FieldAssistResult, GeneratedCharacters, IdeaAnalysis, WizardAnswer } from "../../operations";
import { hash, pick } from "./util";

/**
 * Deterministic scenario-creator mock. It recognises a handful of settings
 * and power fantasies in the idea and assembles a coherent, playable draft.
 * Real providers write far richer drafts; this keeps the whole creator flow
 * testable offline.
 */

type SettingId = "academy" | "pirates" | "space" | "cultivation" | "city" | "fantasy";

interface SettingTemplate {
  world: string;
  description: string;
  magic: string;
  locations: [string, string][];
  factions: [string, string][];
  npcs: { name: string; role: string; personality: string; goal: string; secret: string }[];
  abilities: [string, string, string][];
  tags: string[];
}

const SETTINGS: Record<SettingId, SettingTemplate> = {
  academy: {
    world: "Королевство Арканум",
    description: "Мир, где магия — привилегия аристократии, а главная академия решает судьбы будущих правителей.",
    magic: "Магия черпается из внутреннего ядра. Сила ядра наследуется, но может расти от тренировок и опасных практик.",
    locations: [["Главный зал академии", "Величественный зал с парящими люстрами."], ["Общежитие", "Комнаты студентов, где плетутся интриги."], ["Библиотека", "Хранилище знаний, часть которых запрещена."], ["Тренировочный полигон", "Место дуэлей и испытаний."], ["Столичный квартал", "Город у стен академии."]],
    factions: [["Совет академии", "Управляет академией и защищает интересы знати."], ["Дом Злодея", "Знатный род, чей наследник известен жестокостью."]],
    npcs: [
      { name: "Кассиан", role: "Старший брат героя, будущий «главный злодей»", personality: "Блестящий, холодный, невероятно одарённый, но одинокий", goal: "Стать сильнейшим магом любой ценой", secret: "Боится отца больше смерти" },
      { name: "Элиана", role: "Главная героиня оригинальной истории", personality: "Добрая, упрямая, с обострённым чувством справедливости", goal: "Доказать, что простолюдинка может стать великим магом", secret: "Её дар — редчайшая магия света" },
      { name: "Профессор Вейл", role: "Преподаватель боевой магии", personality: "Ироничный, наблюдательный", goal: "Найти по-настоящему талантливых учеников", secret: "Шпион короны в академии" },
      { name: "Мира", role: "Служанка героя", personality: "Тихая, преданная, замечает всё", goal: "Защитить молодого господина", secret: "Тайно докладывает главе дома" },
    ],
    abilities: [["Магическая стрела", "attack", "Базовое атакующее заклинание."], ["Барьер", "defense", "Защитный купол."], ["Чтение ауры", "utility", "Позволяет оценить силу противника."], ["Ускорение", "movement", "Кратковременный рывок."]],
    tags: ["Magic Academy", "Fantasy", "Nobility"],
  },
  pirates: {
    world: "Архипелаг Тысячи Ветров",
    description: "Бесконечный океан с сотнями островов, морскими державами и пиратами, ищущими легендарные сокровища.",
    magic: "Редкие люди обладают Дарами Моря — странными силами, полученными от древних реликвий.",
    locations: [["Маленький остров", "Тихая деревня рыбаков."], ["Портовый город", "Шумная гавань, полная таверн и шпионов."], ["Корабль", "Небольшое, но быстрое судно."], ["Морская база", "Крепость флота Адмиралтейства."], ["Таинственный риф", "Место, где пропадают корабли."]],
    factions: [["Адмиралтейство", "Морской флот, поддерживающий порядок жёсткой рукой."], ["Вольные капитаны", "Союз пиратских команд."]],
    npcs: [
      { name: "Капитан Рейна", role: "Молодая пиратка с большой мечтой", personality: "Дерзкая, весёлая, верная команде", goal: "Найти легендарное сокровище", secret: "Дочь адмирала" },
      { name: "Старый Бранн", role: "Корабельный кок", personality: "Ворчливый, мудрый", goal: "Дожить до спокойной старости", secret: "Бывший легендарный пират" },
      { name: "Командор Сайлас", role: "Офицер флота", personality: "Принципиальный, жёсткий", goal: "Искоренить пиратство", secret: "Сомневается в приказах сверху" },
      { name: "Лис", role: "Информатор", personality: "Скользкий, обаятельный", goal: "Заработать", secret: "Работает на обе стороны" },
    ],
    abilities: [["Абордажный удар", "attack", "Мощный удар в ближнем бою."], ["Морская интуиция", "utility", "Чувство погоды и течений."], ["Уклонение", "defense", "Ловкое уклонение от атак."], ["Рывок по канату", "movement", "Быстрое перемещение по кораблю."]],
    tags: ["Pirates", "Adventure", "Sea"],
  },
  space: {
    world: "Сектор Ориона",
    description: "Галактическое пограничье, где корпорации, повстанцы и древние ксенотехнологии делят звёзды.",
    magic: "Пси-способности пробуждаются у немногих после контакта с артефактами Предтеч.",
    locations: [["Станция «Перекрёсток»", "Торговый узел на краю сектора."], ["Корабль героя", "Потрёпанный грузовик."], ["Шахтёрская луна", "Пыльная колония."], ["Руины Предтеч", "Древний комплекс на мёртвой планете."]],
    factions: [["Корпорация «Гелиос»", "Мегакорпорация, контролирующая торговлю."], ["Свободные колонии", "Повстанцы пограничья."]],
    npcs: [
      { name: "Вера Кейн", role: "Пилот", personality: "Циничная, смелая", goal: "Выкупить свой корабль", secret: "В розыске корпорации" },
      { name: "ИИ «Сократ»", role: "Бортовой искусственный интеллект", personality: "Вежливый, ироничный", goal: "Понять людей", secret: "Ограничители давно отключены" },
      { name: "Директор Холл", role: "Представитель корпорации", personality: "Обходительный, опасный", goal: "Заполучить артефакт", secret: "Сам заражён пси-резонансом" },
    ],
    abilities: [["Импульсный выстрел", "attack", "Выстрел из бластера."], ["Энергощит", "defense", "Персональный щит."], ["Взлом", "utility", "Доступ к системам."], ["Телекинез", "control", "Пси-воздействие на предметы."]],
    tags: ["Sci-Fi", "Space", "Adventure"],
  },
  cultivation: {
    world: "Земли Девяти Небес",
    description: "Мир сект и кланов, где практики возвышаются через культивацию и бросают вызов небесам.",
    magic: "Культивация: накопление ци, прорывы через стадии Закалки Тела, Основания, Золотого Ядра и выше.",
    locations: [["Внешний двор секты", "Место учеников низшего ранга."], ["Пик Медитации", "Тихая вершина для культивации."], ["Рынок клана", "Торговля пилюлями и техниками."], ["Запретный лес", "Земли духовных зверей."]],
    factions: [["Секта Лазурного Облака", "Праведная секта героя."], ["Клан Кровавой Луны", "Демонические практики."]],
    npcs: [
      { name: "Старейшина Мо", role: "Наставник", personality: "Строгий, скрыто заботливый", goal: "Возродить славу секты", secret: "Его ядро повреждено" },
      { name: "Лин Сюэ", role: "Старшая сестра по секте", personality: "Холодная, гордая", goal: "Достичь Золотого Ядра первой", secret: "Носит в себе печать демона" },
      { name: "Чжао Мэн", role: "Высокомерный молодой господин", personality: "Заносчивый, мстительный", goal: "Унизить героя", secret: "Труслив" },
    ],
    abilities: [["Кулак Тигра", "attack", "Удар, наполненный ци."], ["Дыхание Черепахи", "defense", "Укрепление тела."], ["Шаг Облака", "movement", "Лёгкая походка."], ["Медитация", "support", "Восстановление ци."]],
    tags: ["Cultivation", "Xianxia", "Martial Arts"],
  },
  city: {
    world: "Неон-Сити",
    description: "Мегаполис будущего, где власть принадлежит корпорациям, а улицы — бандам и хакерам.",
    magic: "Кибер-импланты и нейросети заменяют магию; редкие «глитчи» умеют ломать реальность сети.",
    locations: [["Нижний город", "Трущобы под неоновыми вывесками."], ["Корпоративная башня", "Сверкающий шпиль власти."], ["Бар «Ноль»", "Место встречи наёмников."], ["Заброшенное метро", "Логово банд."]],
    factions: [["Корпорация «Аркадия»", "Хозяева города."], ["Сеть «Тень»", "Хакеры-анархисты."]],
    npcs: [
      { name: "Джин", role: "Фиксер", personality: "Деловой, усталый", goal: "Выжить и разбогатеть", secret: "Должен корпорации" },
      { name: "Рэй", role: "Хакер", personality: "Нервная, гениальная", goal: "Взломать «Аркадию»", secret: "Сама наполовину ИИ" },
      { name: "Офицер Ким", role: "Полицейский", personality: "Честный в нечестном городе", goal: "Найти справедливость", secret: "Брат состоит в банде" },
    ],
    abilities: [["Выстрел", "attack", "Стрельба из пистолета."], ["Взлом сети", "utility", "Проникновение в системы."], ["Рефлексы", "defense", "Ускоренные реакции."], ["Глитч", "special", "Сбой реальности сети."]],
    tags: ["Cyberpunk", "City", "Noir"],
  },
  fantasy: {
    world: "Эльдмар",
    description: "Королевства, древние руины и чудовища, пробуждающиеся после долгого сна.",
    magic: "Магия рун: заклинания складываются из древних символов и требуют выносливости.",
    locations: [["Деревня у леса", "Тихое место, где всё начинается."], ["Столица", "Город интриг и возможностей."], ["Древние руины", "Опасное место, полное тайн."], ["Тракт", "Дорога между королевствами."]],
    factions: [["Корона", "Королевская власть."], ["Гильдия искателей", "Наёмники и авантюристы."]],
    npcs: [
      { name: "Арден", role: "Странствующий рыцарь", personality: "Благородный, наивный", goal: "Совершить подвиг", secret: "Лишён титула" },
      { name: "Селена", role: "Травница", personality: "Добрая, острая на язык", goal: "Защитить деревню", secret: "Ведьма" },
      { name: "Мастер Горн", role: "Глава гильдии", personality: "Расчётливый", goal: "Влияние", secret: "Ищет ту же реликвию, что и все" },
    ],
    abilities: [["Удар мечом", "attack", "Базовая атака."], ["Руна щита", "defense", "Защитная руна."], ["Руна света", "utility", "Освещает тьму."], ["Рывок", "movement", "Быстрое сближение."]],
    tags: ["Fantasy", "Adventure"],
  },
};

function detectSetting(idea: string): SettingId {
  const t = idea.toLowerCase();
  if (/академи|школ|магическ|университет/.test(t)) return "academy";
  if (/пират|мор[ея]|корабл|остров/.test(t)) return "pirates";
  if (/космос|звёзд|звезд|галакт|планет/.test(t)) return "space";
  if (/культивац|секта|ци\b|бессмерт/.test(t)) return "cultivation";
  if (/киберпанк|неон|мегаполис|хакер/.test(t)) return "city";
  return "fantasy";
}

interface PowerConcept {
  systemName: string;
  description: string;
  ability: [string, string, string];
  mechanic: string;
}

function detectPower(idea: string): PowerConcept | null {
  const t = idea.toLowerCase();
  if (/вор|краст|крад|похищ|копир/.test(t)) {
    return { systemName: "Система Похищения", description: "Позволяет похищать способности у побеждённых или тех, к кому герой прикоснулся в момент применения техники.", ability: ["Похищение навыка", "forbidden", "Забирает копию увиденной способности. Чем сильнее цель, тем выше риск отката."], mechanic: "Похищенная способность начинается с низким мастерством; у жертвы она ослабевает на время." };
  }
  if (/всемогущ|бог/.test(t)) {
    return { systemName: "Система Всемогущества", description: "Огромная сила, запечатанная ограничителями, которые снимаются по мере роста героя.", ability: ["Снятие ограничителя", "special", "Временно снимает одну печать силы."], mechanic: "Каждое снятие печати привлекает внимание могущественных сущностей." };
  }
  if (/систем/.test(t)) {
    return { systemName: "Система", description: "Игровой интерфейс, выдающий задания и награды.", ability: ["Анализ", "special", "Показывает информацию о цели."], mechanic: "Задания Системы дают опыт и очки навыков." };
  }
  return null;
}

function titleFromIdea(idea: string): string {
  const first = idea.split(/[.!?\n]/)[0]?.trim() ?? idea;
  const clean = first.replace(/^(хочу|хочется)\s+(историю,?\s*)?(где|в которой|про)?\s*/i, "");
  const t = clean.length > 70 ? `${clean.slice(0, 70).trimEnd()}…` : clean;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function mockAnalyzeIdea(idea: string): IdeaAnalysis {
  const setting = detectSetting(idea);
  const tpl = SETTINGS[setting];
  const power = detectPower(idea);
  const questions: IdeaAnalysis["questions"] = [
    {
      id: "start_time",
      question: "Когда начинается история?",
      why: "От этого зависит, сколько у героя времени до ключевых событий.",
      options: [
        { id: "a", label: "За несколько лет до главных событий", description: "Есть время подготовиться" },
        { id: "b", label: "Незадолго до главных событий", description: "Напряжённый старт" },
        { id: "c", label: "В разгар конфликта", description: "Сразу в гущу событий" },
        { id: "d", label: "Другое время", description: "Опишите своё" },
      ],
      allowCustom: true,
    },
  ];
  if (power) {
    questions.push({
      id: "power",
      question: `Как работает «${power.systemName}»?`,
      why: "Чтобы герой был сильным, но не скучным.",
      options: [
        { id: "a", label: "Постепенное раскрытие", description: "Сила растёт ступенями через тренировки и события" },
        { id: "b", label: "Очки за достижения", description: "Система награждает очками за поступки" },
        { id: "c", label: "Мощь с ценой", description: "Сила доступна сразу, но каждое применение имеет последствия" },
        { id: "d", label: "Свой вариант", description: "" },
      ],
      allowCustom: true,
    });
  }
  questions.push(
    {
      id: "start_place",
      question: "Где герой начинает?",
      why: "Стартовая точка задаёт первые сцены и знакомства.",
      options: tpl.locations.slice(0, 4).map(([name, description], i) => ({ id: String.fromCharCode(97 + i), label: name, description })),
      allowCustom: true,
    },
    {
      id: "style",
      question: "Какой стиль истории?",
      why: "Влияет на тон рассказчика.",
      options: [
        { id: "a", label: "Серьёзный", description: "" },
        { id: "b", label: "Приключения", description: "" },
        { id: "c", label: "Комедия", description: "" },
        { id: "d", label: "Мрачный", description: "" },
        { id: "e", label: "Смешанный", description: "" },
      ],
      allowCustom: true,
    },
  );
  if (/знает|канон|сюжет|злоде|перерод|попал|попаданец/i.test(idea)) {
    questions.push({
      id: "canon_knowledge",
      question: "Насколько герой знает, как развернутся события?",
      why: "Знания будущего — сильное преимущество и источник интересных решений.",
      options: [
        { id: "none", label: "Не знает", description: "" },
        { id: "partial", label: "Частично", description: "Помнит ключевые события смутно" },
        { id: "full", label: "Знает всё", description: "Но мир может измениться из-за его действий" },
      ],
      allowCustom: false,
    });
  }
  return { summary: `Понял идею как историю в сеттинге «${tpl.world}»${power ? ` с особой силой героя: ${power.systemName}` : ""}.`, questions: questions.slice(0, 5) };
}

function answerOf(answers: WizardAnswer[], id: string): string {
  return answers.find((a) => a.questionId === id)?.answer ?? "";
}

export function mockScenarioDraft(idea: string, answers: WizardAnswer[]): ScenarioInput {
  const setting = detectSetting(idea);
  const tpl = SETTINGS[setting];
  const power = detectPower(idea);
  const style = answerOf(answers, "style") || "Приключения";
  const knowledge = answerOf(answers, "canon_knowledge");
  const startPlace = answerOf(answers, "start_place");
  const locIds = tpl.locations.map(([name]) => slugify(name));
  const startIndex = Math.max(0, tpl.locations.findIndex(([name]) => startPlace && name.toLowerCase() === startPlace.toLowerCase()));
  const npcIds = tpl.npcs.map((n) => slugify(n.name));
  const factionIds = tpl.factions.map(([name]) => slugify(name));
  const abilities = [...tpl.abilities, ...(power ? [power.ability] : [])].map(([name, category, description], i) => ({
    id: slugify(name),
    name,
    description,
    category,
    difficulty: category === "forbidden" ? 6 : 2 + (i % 3),
    mastery: category === "forbidden" ? 5 : 15,
    energyCost: category === "passive" ? 0 : 8 + i * 4,
    cooldown: category === "forbidden" ? 120 : 0,
    tags: [],
  }));
  const isVillainSibling = /брат|сестр/i.test(idea) && /злод/i.test(idea);

  return {
    id: "draft",
    metadata: {
      title: titleFromIdea(idea),
      shortDescription: `${tpl.description} ${power ? `Герой получает ${power.systemName.toLowerCase()}.` : ""}`.trim(),
      fullDescription: `${idea.trim()}\n\n${tpl.description}`,
      origin: "original",
    },
    tags: { genre: [...tpl.tags, ...(power ? ["System"] : [])], tone: [style], features: ["Sandbox", ...(knowledge && knowledge !== "Не знает" ? ["Canon Knowledge"] : [])], themes: isVillainSibling ? ["Family", "Redemption"] : ["Growth"] },
    world: {
      name: tpl.world,
      description: tpl.description,
      history: "Сотни лет назад мир пережил катастрофу, о которой помнят лишь легенды. Её последствия до сих пор определяют расстановку сил.",
      magicSystem: tpl.magic,
      powerSystem: power ? `${power.systemName}: ${power.description}` : tpl.magic,
      politics: `${tpl.factions.map(([n, d]) => `${n} — ${d}`).join(" ")}`,
      importantRules: [power ? power.mechanic : "Сила требует платы.", "Мир реагирует на поступки героя."],
    },
    mechanics: {
      stats: [
        { id: "health", name: "Здоровье", kind: "resource", default: 100, max: 100 },
        { id: "energy", name: "Энергия", kind: "resource", default: 60, max: 100 },
        { id: "strength", name: "Сила", kind: "attribute", default: 10 },
        { id: "intellect", name: "Интеллект", kind: "attribute", default: 10 },
        { id: "charm", name: "Обаяние", kind: "attribute", default: 10 },
      ],
    },
    locations: tpl.locations.map(([name, description], i) => ({
      id: locIds[i] ?? `loc-${i}`,
      name,
      description,
      connections: locIds.filter((_, j) => j !== i && Math.abs(j - i) <= 2).map((locationId) => ({ locationId, travelMinutes: 20 })),
    })),
    npcs: tpl.npcs.map((n, i) => ({
      id: npcIds[i] ?? `npc-${i}`,
      name: n.name,
      description: isVillainSibling && i === 0 ? `${n.role}. Родной брат героя.` : n.role,
      personality: n.personality,
      goals: [n.goal],
      secrets: [{ id: `${npcIds[i]}-secret`, description: n.secret }],
      startingLocationId: locIds[i % locIds.length],
      startingMood: "спокойствие",
      factionIds: [factionIds[i % factionIds.length] ?? ""].filter(Boolean),
      importance: i < 3 ? "major" : "minor",
    })),
    factions: tpl.factions.map(([name, description], i) => ({ id: factionIds[i] ?? `f-${i}`, name, description, leaderId: npcIds[i], goals: ["Влияние"], enemyIds: factionIds.filter((_, j) => j !== i) })),
    abilities,
    items: [
      { id: "healing-potion", name: "Лечебное зелье", type: "consumable", effects: [{ type: "resource", resourceId: "health", amount: 30 }] },
      { id: "energy-tonic", name: "Тоник энергии", type: "consumable", effects: [{ type: "resource", resourceId: "energy", amount: 25 }] },
      { id: "mysterious-token", name: "Загадочный жетон", type: "key", stackable: false, description: "Предмет, связанный с прошлым героя." },
    ],
    lore: [{ id: "catastrophe", type: "historical_event", name: "Древняя катастрофа", description: "Событие, изменившее мир." }],
    quests: [
      { id: "first-steps", title: "Первые шаги", description: "Освоиться в новом мире и не выдать себя.", objectives: [{ id: "explore", description: "Осмотреться и понять, где ты" }, { id: "ally", description: "Найти первого союзника" }], rewards: { xp: 100 } },
      { id: "fate", title: "Изменить судьбу", description: isVillainSibling ? "Не дать брату стать злодеем — или стать сильнее его." : "Повлиять на ход главных событий.", objectives: [{ id: "learn", description: "Узнать, что грозит в будущем" }, { id: "act", description: "Сделать решающий выбор" }], rewards: { xp: 300 } },
    ],
    timeline: [
      { id: "inciting-event", title: "Первое потрясение", date: { year: 1, month: 1, day: 7 }, description: "Происшествие, которое привлекает внимание всех фракций.", importance: 60, mutable: true, participants: npcIds.slice(0, 2), conditions: [{ type: "flag", key: "inciting_prevented", equals: false }] },
      { id: "turning-point", title: "Поворотный момент", date: { year: 1, month: 2, day: 1 }, description: isVillainSibling ? "Брат героя совершает поступок, после которого пути назад нет." : "Конфликт фракций выходит наружу.", importance: 85, mutable: true, hidden: true, participants: npcIds.slice(0, 1) },
    ],
    system: power
      ? { enabled: true, name: power.systemName, description: power.description, voice: "Короткие уведомления в квадратных скобках.", modules: { levels: true, experience: true, skillPoints: true, quests: true, achievements: true }, customMechanics: [{ id: "core-mechanic", name: power.systemName, rules: power.mechanic }] }
      : { enabled: false },
    characterCreation: {
      fields: [
        { id: "name", label: "Имя", type: "text", required: true },
        { id: "gender", label: "Пол", type: "text" },
        { id: "age", label: "Возраст", type: "number" },
        { id: "appearance", label: "Внешность", type: "textarea" },
        { id: "personality", label: "Характер", type: "textarea" },
        { id: "background", label: "Прошлое", type: "textarea" },
      ],
      startingAbilityIds: abilities.slice(0, 2).map((a) => a.id).concat(power ? [slugify(power.ability[0])] : []),
      startingItems: [{ itemId: "healing-potion", quantity: 2 }, { itemId: "mysterious-token", quantity: 1 }],
    },
    start: {
      date: { year: 1, month: 1, day: 1, hour: 9, minute: 0 },
      locationId: locIds[startIndex] ?? locIds[0] ?? "start",
      situation: isVillainSibling ? "Герой просыпается в теле младшего брата будущего главного злодея, за несколько лет до трагедии." : `Герой оказывается в мире «${tpl.world}» и пытается понять, что происходит.`,
      playerKnowledge: knowledge === "full" || knowledge === "Знает всё" ? "full" : knowledge === "none" || knowledge === "Не знает" ? "none" : "partial",
      knownFacts: ["Герой помнит, что через месяц случится поворотный момент, который изменит всё."],
      playerSecrets: [{ id: "otherworlder", description: "Герой — переселенец из другого мира.", keywords: ["другого мира", "другой мир", "переселенец", "попаданец"], importance: 90 }],
      activeQuestIds: ["first-steps"],
      openingScene: `Ты открываешь глаза. ${tpl.locations[startIndex]?.[1] ?? ""} Всё вокруг незнакомо — и одновременно до странного узнаваемо.${power ? `\n\n[${power.systemName} активирована.]` : ""}`,
    },
    rules: {
      tone: style,
      narrativeStyle: "Живая проза в духе ранобэ",
      comedy: /комед/i.test(style) ? "high" : "low",
      violence: /мрачн/i.test(style) ? "high" : "medium",
      progressionSpeed: answerOf(answers, "power").includes("Мощь") ? "fast" : "normal",
    },
    storyHooks: [isVillainSibling ? "Можно ли спасти брата от его судьбы?" : "Почему герой оказался здесь?", "Кто ещё знает о его силе?", "Какую цену потребует Система?"],
  };
}

function nextId(scenario: Scenario, base: string): string {
  const taken = new Set([...scenario.factions, ...scenario.npcs, ...scenario.timeline, ...scenario.lore].map((x) => x.id));
  let id = slugify(base);
  let i = 2;
  while (taken.has(id)) id = `${slugify(base)}-${i++}`;
  return id;
}

export function mockRevision(scenario: Scenario, instruction: string): ScenarioPatch {
  const t = instruction.toLowerCase();
  if (/политик/.test(t)) {
    return {
      title: "Больше политики",
      summary: "Добавил тайный совет, борьбу за влияние и событие, которое обострит политику.",
      operations: [
        { op: "set", path: "world.politics", value: `${scenario.world.politics} Внутри правящих кругов идёт тихая борьба: кланы покупают голоса, а тайный совет решает, кому достанется власть.`.trim() },
        { op: "add", collection: "factions", value: { id: nextId(scenario, "tainyy-sovet"), name: "Тайный совет", description: "Неформальный союз влиятельных семей, который на деле управляет политикой.", goals: ["Сохранить власть", "Контролировать наследников"] } },
        { op: "add", collection: "timeline", value: { id: nextId(scenario, "vybory-soveta"), title: "Выборы совета", date: { year: scenario.start.date.year, month: Math.min(scenario.calendar.monthNames.length, scenario.start.date.month + 1), day: 10 }, description: "Голосование, которое перераспределит влияние.", importance: 70, mutable: true } },
      ],
    };
  }
  if (/сильн|имб|баланс/.test(t)) {
    return {
      title: "Балансировка героя",
      summary: "Способности героя дороже и медленнее растут, но остаются особенными.",
      operations: [
        ...scenario.abilities
          .filter((a) => scenario.characterCreation.startingAbilityIds.includes(a.id))
          .map((a) => ({ op: "update" as const, collection: "abilities" as const, id: a.id, value: { energyCost: Math.ceil(a.energyCost * 1.5) + 2, cooldown: a.cooldown + 10 } })),
        { op: "set", path: "rules.progressionSpeed", value: "slow" },
      ],
    };
  }
  if (/систем/.test(t) && /менее|свобод|огранич/.test(t)) {
    return {
      title: "Система свободнее",
      summary: "Больше очков навыков за уровень и меньше жёстких ограничений.",
      operations: [
        { op: "set", path: "system.skillPointsPerLevel", value: scenario.system.skillPointsPerLevel + 1 },
        { op: "set", path: "system.description", value: `${scenario.system.description} Ограничения мягче: герой сам решает, какие ветви развивать.` },
      ],
    };
  }
  const factionMatch = t.match(/(организаци|фракци|гильди|орден|клан)[а-я]*\s*([а-яё\s-]{0,30})/);
  if (/добав/.test(t) && factionMatch) {
    const name = `${factionMatch[1] === "орден" ? "Орден" : factionMatch[1] === "гильди" ? "Гильдия" : "Организация"} ${(factionMatch[2] ?? "").trim() || "Тени"}`.trim();
    return {
      title: `Новая фракция: ${name}`,
      summary: "Черновик новой фракции. Сохраните, если нравится.",
      operations: [{ op: "add", collection: "factions", value: { id: nextId(scenario, name), name, description: `${name} — влиятельная организация со своими целями и тайнами.`, goals: ["Расширить влияние", "Найти редкие артефакты"], territory: scenario.locations[0]?.name ?? "" } }],
    };
  }
  if (/персонаж|нпс|npc/.test(t)) {
    const id = nextId(scenario, "novyy-personazh");
    return { title: "Новый персонаж", summary: "Черновик нового NPC.", operations: [{ op: "add", collection: "npcs", value: { id, name: "Новый персонаж", description: instruction, personality: "Опишите характер", startingLocationId: scenario.start.locationId } }] };
  }
  return {
    title: "Указание рассказчику",
    summary: "Добавил пожелание в инструкции для рассказчика.",
    operations: [{ op: "set", path: "rules.customInstructions", value: [scenario.rules.customInstructions, instruction].filter(Boolean).join("\n") }],
  };
}

export function mockAlternatives(scenario: Scenario, instruction: string): ScenarioPatch[] {
  const concepts = [
    { name: "Система Договоров", desc: "Сила приходит через договоры с духами: каждый договор даёт способность, но духи требуют исполнения условий.", rules: "Нарушенный договор отнимает способность и навлекает проклятие." },
    { name: "Система Резонанса", desc: "Сила питается эмоциями: чем сильнее чувство, тем мощнее техника — но и тем труднее её контролировать.", rules: "Сильные эмоции дают бонус, спокойствие — точность. Переполнение резонанса вызывает срыв." },
    { name: "Система Долга", desc: "Герой берёт силу взаймы у собственного будущего. Каждое использование записывается в долг.", rules: "Долг возвращается в самый неподходящий момент: усталостью, неудачами или чем-то хуже." },
  ];
  return concepts.map((c) => ({
    title: c.name,
    summary: `${c.desc}${instruction ? ` (по запросу: «${instruction}»)` : ""}`,
    operations: [
      { op: "set", path: "system.name", value: c.name },
      { op: "set", path: "system.description", value: c.desc },
      { op: "set", path: "system.enabled", value: true },
      { op: "set", path: "system.customMechanics", value: [{ id: slugify(c.name), name: c.name, rules: c.rules }] },
    ],
  }));
}

export function mockFieldAssist(input: { fieldLabel: string; value: string; action: FieldAction; wish?: string }): FieldAssistResult {
  const base = input.value.trim() || input.wish?.trim() || input.fieldLabel;
  const seed = `${input.fieldLabel}:${base}`;
  switch (input.action) {
    case "expand":
    case "detail":
      return { suggestions: [{ title: "Подробнее", text: `${base}\n\nУ этого есть история: то, что кажется простым, скрывает старый конфликт. Люди относятся к этому по-разному — одни с благоговением, другие со страхом. Именно здесь герой может найти первую зацепку.` }], note: "" };
    case "rewrite":
      return { suggestions: [{ title: "Выразительнее", text: `${pick(["Говорят, что", "Мало кто помнит, что", "В старых хрониках сказано, что"], seed)} ${base.charAt(0).toLowerCase()}${base.slice(1)}` }], note: "" };
    case "simplify":
      return { suggestions: [{ title: "Короче", text: base.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ") }], note: "" };
    case "contradictions":
      return { suggestions: [{ title: "Проверка", text: "Явных противоречий не найдено. Убедитесь, что ограничения силы согласуются с правилами мира." }], note: "Mock-провайдер проверяет только поверхностно." };
    case "balance":
      return { suggestions: [{ title: "Баланс", text: `${base}\n\nОграничение: использование требует времени на восстановление и привлекает внимание.` }], note: "" };
    case "help":
    case "ideas":
    case "alternatives":
      return {
        suggestions: [
          { title: "Цена силы", text: `${base}: сила растёт вместе с ценой — каждое применение что-то отнимает у владельца.` },
          { title: "Наследие", text: `${base}: это наследие древней эпохи, и его истинная природа скрыта даже от мастеров.` },
          { title: "Связь", text: `${base}: работает только через связь с другими — союзниками, духами или местами силы.` },
        ],
        note: "",
      };
  }
}

export function mockAssistant(scenario: Scenario, message: string): AssistantResult {
  const t = message.toLowerCase();
  if (/плох|не так|проблем|слаб|провер/.test(t)) {
    const report = validateScenario(scenario);
    const lines = report.issues.slice(0, 8).map((i) => `• ${i.level === "error" ? "Ошибка" : i.level === "warning" ? "Предупреждение" : "Совет"}: ${i.message}`);
    const extra: string[] = [];
    if (scenario.npcs.length < 3) extra.push("• Мало персонажей: истории нужны хотя бы 3 живых NPC с собственными целями.");
    if (!scenario.world.history.trim()) extra.push("• У мира нет истории — рассказчику сложнее придумывать последствия.");
    return { reply: [`Вот что я вижу в «${scenario.metadata.title}»:`, ...lines, ...extra].join("\n") || "Серьёзных проблем не вижу.", proposals: [] };
  }
  if (/сильн|имб|баланс/.test(t) || /добав|фракц|организац|политик|персонаж/.test(t)) {
    const patch = mockRevision(scenario, message);
    return { reply: `Предлагаю: ${patch.summary} Изменение не сохранено — примените его, если согласны.`, proposals: [patch] };
  }
  if (/систем/.test(t) && /не нрав|друг|альтернатив/.test(t)) {
    return { reply: "Вот три совершенно разных подхода к системе:", proposals: mockAlternatives(scenario, message) };
  }
  return { reply: `Понял. Чтобы помочь точнее, скажите, что изменить: мир, персонажей, систему или правила рассказчика. Сейчас в сценарии ${scenario.npcs.length} NPC, ${scenario.locations.length} локаций и ${scenario.quests.length} квестов.`, proposals: [] };
}

export function mockReview(scenario: Scenario): AIReview {
  const issues: AIReview["issues"] = [];
  if (scenario.world.description.length < 120) issues.push({ level: "suggestion", message: "Описание мира короткое: добавьте, чем этот мир отличается от других.", section: "world" });
  if (scenario.system.enabled && scenario.system.customMechanics.length === 0) issues.push({ level: "suggestion", message: "Система включена, но не описаны её особые правила — рассказчик будет импровизировать.", section: "system" });
  if (scenario.rules.playerFreedom === "guided" && scenario.quests.length === 0) issues.push({ level: "warning", message: "Выбран направляемый сюжет, но нет квестов, куда направлять.", section: "quests" });
  const strong = scenario.abilities.filter((a) => scenario.characterCreation.startingAbilityIds.includes(a.id) && a.difficulty >= 7);
  if (strong.length > 0) issues.push({ level: "warning", message: `Стартовые способности очень сильные (${strong.map((a) => a.name).join(", ")}). Проверьте баланс.`, section: "abilities" });
  return { issues };
}

const NAMES = ["Рин", "Алекс", "Кира", "Тео", "Мирон", "Лея", "Ян", "Ева", "Даниэль", "Ника"];

export function mockCharacters(scenario: Scenario, request: string): GeneratedCharacters {
  const seed = hash(`${scenario.id}:${request}`);
  const archetypes = [
    { summary: "Тихий наблюдатель, который замечает то, что упускают другие.", personality: "Спокойный, внимательный, саркастичный", background: "Бывший студент, любивший разбирать сложные системы" },
    { summary: "Импульсивный оптимист, который сначала делает, потом думает.", personality: "Энергичный, честный, упрямый", background: "Спортсмен, привыкший полагаться на тело" },
    { summary: "Расчётливый стратег с мягкой улыбкой.", personality: "Вежливый, хитрый, скрытный", background: "Работал в офисе и мечтал о приключениях" },
  ];
  return {
    characters: archetypes.map((a, i) => {
      const fields: Record<string, string> = { personality: a.personality, background: a.background, age: String(16 + ((seed + i) % 5)) };
      for (const field of scenario.characterCreation.fields) {
        const option = field.options[(seed + i) % Math.max(1, field.options.length)];
        if (field.type === "select" && option) fields[field.id] = option.value;
      }
      return { name: NAMES[(seed + i * 3) % NAMES.length] ?? "Герой", summary: a.summary, fields };
    }),
  };
}
