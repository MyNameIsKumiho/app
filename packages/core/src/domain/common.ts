import { z } from "zod";

/** Stable identifier used across scenarios and game state (slug-like). */
export const IdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "id must be lowercase letters, digits, '-' or '_'");
export type Id = z.infer<typeof IdSchema>;

/** 0..100 importance used by memories, facts and timeline events. */
export const ImportanceSchema = z.number().int().min(0).max(100);

/** Importance at or above which a memory is permanent and never pruned. */
export const PERMANENT_IMPORTANCE = 80;

export const TextSchema = z.string().max(20_000);
export const ShortTextSchema = z.string().max(500);

/** Turns any human label into a valid id ("Огненный шар" -> "ognennyi-shar"). */
export function slugify(input: string, fallback = "item"): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  const slug = input
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : fallback;
}

/** Returns an id based on `base` that is not in `taken`. */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const root = slugify(base);
  if (!set.has(root)) return root;
  let i = 2;
  while (set.has(`${root}-${i}`)) i += 1;
  return `${root}-${i}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
