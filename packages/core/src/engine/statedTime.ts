/**
 * Reads time skips the player states in plain words ("прошло 12 дней",
 * "жду три часа", "спустя неделю") so the clock moves even when the
 * Storyteller forgets to report it.
 */

const NUMBER_WORDS: Record<string, number> = {
  один: 1, одну: 1, одна: 1, одного: 1, пару: 2, пара: 2, два: 2, две: 2, двух: 2, три: 3, трёх: 3, трех: 3, четыре: 4, четырёх: 4, четырех: 4,
  пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14,
  пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19, двадцать: 20, тридцать: 30, сорок: 40,
  пятьдесят: 50, сто: 100, несколько: 3, полтора: 1.5, полторы: 1.5,
};

const UNITS: [RegExp, number][] = [
  [/^минут/, 1],
  [/^час/, 60],
  [/^(сут|ден|дня|дне)/, 60 * 24],
  [/^недел/, 60 * 24 * 7],
  [/^месяц/, 60 * 24 * 30],
  [/^(год|лет)/, 60 * 24 * 365],
];

/** Words around a duration that mean time actually passes for the hero. */
const PASSING = /(прош(ло|ли|ла|ёл|ел)|проход|спустя|через|пропуск|пропуст|жд(у|ать|ём|ем|ал)|подожд|провож|провёл|провел|провести|сплю|спал|проспал|отдыха|трениру|учусь|занима)/i;

function unitMinutes(word: string): number | null {
  for (const [re, minutes] of UNITS) if (re.test(word)) return minutes;
  return null;
}

/** The longest explicit duration in `text`, in minutes, or 0 when none is stated. */
export function statedDurationMinutes(text: string): number {
  const lower = text.toLowerCase().replace(/ё/g, "е");
  if (!PASSING.test(lower)) return 0;
  const tokens = lower.split(/[^\p{L}\d.,]+/u).filter(Boolean);
  let best = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    const unit = unitMinutes(token);
    if (unit === null) continue;
    const prev = tokens[i - 1] ?? "";
    const numeric = Number(prev.replace(",", "."));
    const count = Number.isFinite(numeric) && prev !== "" ? numeric : (NUMBER_WORDS[prev] ?? (/^(полчаса|полдня)$/.test(token) ? 0.5 : 1));
    // "сутки" alone means one day; "час" alone means one hour.
    best = Math.max(best, Math.round(count * unit));
  }
  if (/полчаса/.test(lower)) best = Math.max(best, 30);
  if (/полдня/.test(lower)) best = Math.max(best, 12 * 60);
  return best;
}
