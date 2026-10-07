import { z } from "zod";

/** In-world calendar. Every scenario may define its own month names and lengths. */
const STANDARD_MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

export const CalendarSchema = z.object({
  monthNames: z.array(z.string().min(1)).min(1).default(STANDARD_MONTHS),
  daysPerMonth: z.number().int().min(1).max(100).default(30),
  hoursPerDay: z.number().int().min(1).max(48).default(24),
  yearLabel: z.string().default("Год"),
});
export type Calendar = z.infer<typeof CalendarSchema>;

export const DEFAULT_CALENDAR: Calendar = {
  monthNames: STANDARD_MONTHS,
  daysPerMonth: 30,
  hoursPerDay: 24,
  yearLabel: "Год",
};

/** Absolute in-world moment. Month and day are 1-based. */
export const GameTimeSchema = z.object({
  year: z.number().int().min(0),
  month: z.number().int().min(1),
  day: z.number().int().min(1),
  hour: z.number().int().min(0),
  minute: z.number().int().min(0).max(59),
});
export type GameTime = z.infer<typeof GameTimeSchema>;

/** Partial date for timeline events ("Year 2" or "Year 1, Day 15"). */
export const TimelineDateSchema = z.object({
  year: z.number().int().min(0),
  month: z.number().int().min(1).optional(),
  day: z.number().int().min(1).optional(),
  hour: z.number().int().min(0).optional(),
});
export type TimelineDate = z.infer<typeof TimelineDateSchema>;

export type TimeOfDay = "night" | "dawn" | "morning" | "day" | "evening" | "dusk";

const MINUTES_PER_HOUR = 60;

function minutesPerDay(cal: Calendar): number {
  return cal.hoursPerDay * MINUTES_PER_HOUR;
}

function daysPerYear(cal: Calendar): number {
  return cal.daysPerMonth * cal.monthNames.length;
}

/** Converts a moment to absolute minutes since year 0, month 1, day 1. */
export function toMinutes(time: GameTime, cal: Calendar): number {
  const days = time.year * daysPerYear(cal) + (time.month - 1) * cal.daysPerMonth + (time.day - 1);
  return days * minutesPerDay(cal) + time.hour * MINUTES_PER_HOUR + time.minute;
}

export function fromMinutes(total: number, cal: Calendar): GameTime {
  const perDay = minutesPerDay(cal);
  const safe = Math.max(0, Math.floor(total));
  const totalDays = Math.floor(safe / perDay);
  const inDay = safe - totalDays * perDay;
  const year = Math.floor(totalDays / daysPerYear(cal));
  const dayOfYear = totalDays - year * daysPerYear(cal);
  const month = Math.floor(dayOfYear / cal.daysPerMonth) + 1;
  const day = dayOfYear - (month - 1) * cal.daysPerMonth + 1;
  return {
    year,
    month,
    day,
    hour: Math.floor(inDay / MINUTES_PER_HOUR),
    minute: inDay % MINUTES_PER_HOUR,
  };
}

export function addMinutes(time: GameTime, minutes: number, cal: Calendar): GameTime {
  return fromMinutes(toMinutes(time, cal) + minutes, cal);
}

/** Earliest moment a (partial) timeline date refers to. */
export function timelineDateToMinutes(date: TimelineDate, cal: Calendar): number {
  return toMinutes(
    { year: date.year, month: date.month ?? 1, day: date.day ?? 1, hour: date.hour ?? 0, minute: 0 },
    cal,
  );
}

export function timeOfDay(time: GameTime, cal: Calendar): TimeOfDay {
  const ratio = time.hour / cal.hoursPerDay;
  if (ratio < 0.2) return "night";
  if (ratio < 0.29) return "dawn";
  if (ratio < 0.5) return "morning";
  if (ratio < 0.71) return "day";
  if (ratio < 0.83) return "evening";
  if (ratio < 0.92) return "dusk";
  return "night";
}

const TIME_OF_DAY_RU: Record<TimeOfDay, string> = {
  night: "ночь",
  dawn: "рассвет",
  morning: "утро",
  day: "день",
  evening: "вечер",
  dusk: "сумерки",
};

export function formatGameTime(time: GameTime, cal: Calendar): string {
  const month = cal.monthNames[time.month - 1] ?? `Месяц ${time.month}`;
  const hh = String(time.hour).padStart(2, "0");
  const mm = String(time.minute).padStart(2, "0");
  return `${time.day} ${month}, ${cal.yearLabel} ${time.year} · ${hh}:${mm} (${TIME_OF_DAY_RU[timeOfDay(time, cal)]})`;
}

export function formatTimelineDate(date: TimelineDate, cal: Calendar): string {
  const parts = [`${cal.yearLabel} ${date.year}`];
  if (date.month !== undefined) parts.push(cal.monthNames[date.month - 1] ?? `Месяц ${date.month}`);
  if (date.day !== undefined) parts.push(`день ${date.day}`);
  return parts.join(", ");
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ч ${minutes % 60} мин`;
  return `${Math.floor(hours / 24)} дн`;
}
