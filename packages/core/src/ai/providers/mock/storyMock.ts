import { emotionLabel, intensityLabel } from "../../../domain/actions";
import type { TurnResult } from "../../../domain/turnResult";
import type { StoryMockPayload } from "../../operations";
import { overlap, pick, quoteShort } from "./util";

/**
 * Deterministic Storyteller for development and tests. It produces coherent
 * (if formulaic) scenes and realistic structured changes so every game
 * mechanic can be exercised without an API key.
 */

const OPENINGS = [
  (loc: string) => `${loc} живёт своей жизнью: где-то хлопает дверь, где-то смеются, воздух пахнет пылью и чем-то неуловимо магическим.`,
  (loc: string) => `В ${loc.toLowerCase()} на мгновение становится тише, будто само место прислушивается к тебе.`,
  (loc: string) => `Свет ложится на ${loc.toLowerCase()} косыми полосами, и в них медленно кружатся пылинки.`,
];

const SAY_REACTIONS = [
  (name: string, q: string) => `${name} чуть склоняет голову, обдумывая услышанное.\n\n@${name}: «${q}»… Ладно. Допустим, я тебя услышал(а). Но учти: слова здесь стоят дёшево.`,
  (name: string) => `${name} смотрит на тебя внимательнее, чем секунду назад.\n\n@${name}: Странно ты говоришь. Не как местные. Продолжай, раз начал.\n\nВ голосе нет враждебности, только любопытство.`,
  (name: string) => `${name} усмехается, но взгляд остаётся цепким.\n\n@${name}: Смело. Посмотрим, хватит ли тебе смелости, когда дойдёт до дела.`,
  (name: string) => `${name} на мгновение отводит глаза, будто твои слова задели что-то личное.\n\n@${name}: Хорошо. Я запомню это.`,
];

const SILENCE_REACTIONS = [
  (name: string) => `${name} ждёт ответа, но не дожидается. Пауза становится неловкой.\n\n@${name}: Молчание — тоже ответ.`,
  (name: string) => `${name} хмурится: твоё молчание явно истолковано по-своему.`,
];

const ENDINGS = [
  "Мир вокруг продолжает двигаться — и, кажется, теперь чуть внимательнее следит за тобой.",
  "Где-то вдалеке звонит колокол, отмеряя время, которое не станет ждать.",
  "Ты ловишь себя на мысли, что каждое решение здесь оставляет след.",
  "Тени удлиняются, и у этого дня явно есть продолжение.",
];

export function mockStoryTurn(p: StoryMockPayload): TurnResult {
  const seed = `${p.turn}:${p.resolved.summary}`;
  const npc = p.present[0];
  const paragraphs: string[] = [pick(OPENINGS, seed)(p.location.name)];
  const result: TurnResult = {
    narrative: "",
    timeAdvanceMinutes: 10,
    stateChanges: [],
    relationshipChanges: [],
    newMemories: [],
    questChanges: [],
    worldChanges: [],
    knowledgeChanges: [],
    npcUpdates: [],
    timelineChanges: [],
    suggestedActions: [],
    illustration: { worthy: p.turn > 0 && p.turn % 6 === 0, description: `${p.heroName} в локации «${p.location.name}»` },
  };

  for (const event of p.worldEvents.filter((e) => e.witnessed)) {
    paragraphs.push(`Внезапно всё меняется: ${event.description}`);
  }

  let spoken = "";
  for (const part of p.parts) {
    switch (part.kind) {
      case "say":
        spoken = part.text;
        paragraphs.push(`@${p.heroName}: ${part.text}`);
        break;
      case "do":
        paragraphs.push(`Ты действуешь: ${part.text}. Окружающие замечают это — кто-то с интересом, кто-то с безразличием.`);
        break;
      case "think":
        paragraphs.push(`Мысль мелькает и прячется глубже: «${part.text}». Снаружи по тебе ничего не прочесть.`);
        break;
      case "silent":
        paragraphs.push("Ты молчишь.");
        if (npc) {
          paragraphs.push(pick(SILENCE_REACTIONS, seed)(npc.name));
          result.relationshipChanges.push({ npcId: npc.id, axis: "suspicion", delta: 2, reason: "промолчал" });
        }
        break;
      case "emotion":
        paragraphs.push(`На лице проступает ${emotionLabel(part.emotion).toLowerCase()} — ${intensityLabel(part.intensity)}.`);
        break;
      case "free":
        spoken = part.text;
        paragraphs.push(`Ты решаешь: ${part.text}.`);
        break;
      default:
        break;
    }
  }
  for (const outcome of p.resolved.outcomes) paragraphs.push(`[${outcome}]`);
  for (const failure of p.resolved.failures) paragraphs.push(`Попытка не удаётся: ${failure.toLowerCase()}`);

  if (npc && spoken) {
    paragraphs.push(pick(SAY_REACTIONS, `${seed}:${npc.id}`)(npc.name, quoteShort(spoken, 50)));
    result.relationshipChanges.push({ npcId: npc.id, axis: "friendship", delta: 2, reason: "разговор" }, { npcId: npc.id, axis: "trust", delta: 1, reason: "разговор" });
    result.newMemories.push({ owner: npc.id, event: `${p.heroName} сказал(а): «${quoteShort(spoken, 120)}»`, importance: 25, emotionalImpact: 5, participants: [npc.id] });
    result.npcUpdates.push({ npcId: npc.id, mood: pick(["заинтересованность", "настороженность", "лёгкое веселье", "задумчивость"], seed) });
  }
  if (p.resolved.outcomes.some((o) => o.startsWith("Способность"))) {
    for (const n of p.present) result.relationshipChanges.push({ npcId: n.id, axis: "respect", delta: 3, reason: "увидел силу героя" });
    result.stateChanges.push({ type: "xp", amount: 10, reason: "практика" });
  }

  const actionText = p.parts.map((x) => ("text" in x ? x.text : "")).join(" ");
  const objective = p.activeObjectives.find((o) => overlap(o.description, actionText) > 0);
  if (objective && !p.resolved.internalOnly) {
    result.questChanges.push({ questId: objective.questId, action: "complete_objective", objectiveId: objective.objectiveId, note: "" });
    result.newMemories.push({ owner: "story", event: `Герой продвинулся в задаче: ${objective.description}`, importance: 60, emotionalImpact: 10, participants: [] });
    paragraphs.push(`Ты чувствуешь, что сделал(а) шаг вперёд: ${objective.description.toLowerCase()}.`);
  }

  paragraphs.push(pick(ENDINGS, `${seed}:end`));
  result.narrative = paragraphs.join("\n\n");

  if (npc) result.suggestedActions.push({ label: `Поговорить: ${npc.name.split(" ")[0]}`, kind: "say", text: "Можно задать тебе вопрос?" });
  result.suggestedActions.push({ label: "Осмотреться", kind: "do", text: "Внимательно осматриваюсь вокруг" });
  result.suggestedActions.push({ label: "Обдумать ситуацию", kind: "think", text: "Что здесь на самом деле происходит?" });
  const next = p.connectedLocations[p.turn % Math.max(1, p.connectedLocations.length)];
  if (next) result.suggestedActions.push({ label: `Пойти: ${next.name}`, kind: "free", text: `Иду в ${next.name}` });
  if (p.abilityNames[0]) result.suggestedActions.push({ label: `Применить: ${p.abilityNames[0]}`, kind: "ability", text: p.abilityNames[0] });
  result.suggestedActions = result.suggestedActions.slice(0, 5);
  return result;
}
