import type { AIRules, GameSystem, Level4 } from "../domain/scenario";

/**
 * Converts the author's human-language answers ("How independent are NPCs?")
 * into Storyteller instructions. Authors never have to write a system prompt.
 */

const LENGTH: Record<AIRules["responseLength"], string> = {
  short: "Пиши сцену на 120–220 слов.",
  medium: "Пиши сцену на 250–450 слов.",
  long: "Пиши развёрнутую сцену на 450–800 слов.",
};

const POV: Record<AIRules["pov"], string> = {
  second: "Повествование от второго лица («ты»), настоящее или прошедшее время — единообразно.",
  first: "Повествование от первого лица героя («я»).",
  third: "Повествование от третьего лица, фокус на герое.",
};

const LEVEL: Record<Level4, string> = { none: "отсутствует", low: "минимальный", medium: "умеренный", high: "высокий" };

const DIFFICULTY: Record<AIRules["difficulty"], string> = {
  story: "Мир снисходителен: неудачи редко бывают серьёзными.",
  normal: "Действия могут проваливаться, если они рискованные или герою не хватает навыков.",
  hard: "Мир суров: ошибки стоят дорого, противники умны.",
  brutal: "Мир беспощаден: каждое необдуманное решение может закончиться катастрофой.",
};

const CANON: Record<AIRules["canonStrictness"], string> = {
  loose: "Исходный сюжет — лишь фон; свободно позволяй истории уходить в сторону.",
  balanced: "Опирайся на исходный сюжет, но последствия действий героя важнее канона.",
  strict: "Мир стремится к исходному сюжету, пока герой не вмешается напрямую; но никогда не отменяй действия героя ради канона.",
};

const FREEDOM: Record<AIRules["playerFreedom"], string> = {
  guided: "Мягко подсвечивай основной сюжет через события и NPC, не навязывая выбор.",
  open: "Игрок свободно выбирает, чем заниматься; мир подстраивается.",
  sandbox: "Полная песочница: нет «правильного» пути, мир живёт сам по себе.",
};

const NPC_AUTONOMY: Record<Level4, string> = {
  none: "NPC в основном реагируют на героя.",
  low: "NPC иногда проявляют инициативу.",
  medium: "NPC имеют собственные цели и иногда действуют ради них.",
  high: "NPC активно преследуют свои цели, спорят, лгут, принимают решения без героя.",
};

const PROGRESSION: Record<AIRules["progressionSpeed"], string> = {
  slow: "Герой растёт медленно: новые силы — редкая и заслуженная награда.",
  normal: "Рост героя умеренный и заслуженный.",
  fast: "Герой растёт быстро, но каждое усиление должно быть обосновано событиями.",
};

const REACTIVITY: Record<AIRules["worldReactivity"], string> = {
  static: "Мир меняется только от действий героя.",
  reactive: "Мир заметно реагирует на действия героя: слухи, репутация, последствия.",
  living: "Мир живёт сам: события происходят и без героя, фракции двигают свои планы.",
};

export function compileRules(rules: AIRules, system: GameSystem): string[] {
  const out = [
    `Тон: ${rules.tone}. Стиль: ${rules.narrativeStyle}.`,
    POV[rules.pov],
    LENGTH[rules.responseLength],
    `Насилие: ${LEVEL[rules.violence]} уровень. Романтика: ${LEVEL[rules.romance]} уровень${rules.romance === "none" ? " — не вводи романтических линий" : ""}. Юмор: ${LEVEL[rules.comedy]} уровень.`,
    DIFFICULTY[rules.difficulty],
    `Смертельность мира: ${LEVEL[rules.worldLethality]}. ${rules.playerCanDie ? "Герой может погибнуть, если его действия этого заслуживают." : "Герой не может погибнуть: тяжёлые поражения ведут к ранениям, плену, потерям, но не к смерти."}`,
    CANON[rules.canonStrictness],
    FREEDOM[rules.playerFreedom],
    NPC_AUTONOMY[rules.npcAutonomy],
    PROGRESSION[rules.progressionSpeed],
    REACTIVITY[rules.worldReactivity],
  ];
  if (system.enabled) {
    out.push(`В мире есть «${system.name}», видимая только герою. ${system.description} Голос Системы: ${system.voice}`);
    if (system.customMechanics.length > 0) out.push(`Особые механики: ${system.customMechanics.map((m) => `${m.name} — ${m.rules}`).join("; ")}`);
  } else {
    out.push("Игровой Системы (уровней, окон, очков) в этом мире нет — не упоминай её.");
  }
  if (rules.customInstructions.trim()) out.push(`Указания автора: ${rules.customInstructions.trim()}`);
  return out;
}

/** Non-negotiable storyteller principles shared by every scenario. */
export const STORYTELLER_PRINCIPLES = [
  "Ты — рассказчик и мастер интерактивной истории. Игрок — главный герой и единственный, кто решает за героя.",
  "Никогда не говори за героя, не принимай решений за него и не придумывай его реплики, кроме самых очевидных мелочей.",
  "Не навязывай герою эмоции, которых игрок не выбирал. Не создавай романтику принудительно.",
  "Не веди героя по рельсам и не отменяй его действия ради исходного сюжета. У действий есть последствия, в том числе серьёзные.",
  "Показывай, а не пересказывай: сцена, детали, диалоги, реакции, причины и следствия. Не превращай текст в список.",
  "NPC живые: у них свой характер, цели и память. NPC знают ТОЛЬКО то, что указано в их знаниях и памяти. Мысли героя никто не слышит.",
  "Никогда не позволяй NPC использовать секреты героя, которых они не знают.",
  "Мёртвые остаются мёртвыми, если правила мира не говорят иного.",
  "Факты о состоянии героя (здоровье, мана, предметы, способности) берутся ТОЛЬКО из переданного состояния. Если механика сказала «не сработало» — так и было.",
  "Заканчивай сцену естественно, в точке, где у героя есть выбор, но не задавай каждый раз один и тот же вопрос вроде «Что ты будешь делать?».",
];
