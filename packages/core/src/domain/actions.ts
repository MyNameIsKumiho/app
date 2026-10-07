import { z } from "zod";

export const EMOTIONS = [
  { id: "calm", label: "Спокойствие" },
  { id: "irritation", label: "Раздражение" },
  { id: "anger", label: "Злость" },
  { id: "fear", label: "Страх" },
  { id: "embarrassment", label: "Смущение" },
  { id: "amusement", label: "Веселье" },
  { id: "confidence", label: "Самоуверенность" },
  { id: "indifference", label: "Безразличие" },
  { id: "suspicion", label: "Подозрение" },
  { id: "threat", label: "Угроза" },
  { id: "sadness", label: "Грусть" },
  { id: "surprise", label: "Удивление" },
] as const;
export type EmotionId = (typeof EMOTIONS)[number]["id"];
const EmotionIdSchema = z.enum(EMOTIONS.map((e) => e.id) as [EmotionId, ...EmotionId[]]);

export const ActionPartSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("say"), text: z.string().min(1).max(4000) }),
  z.object({ kind: z.literal("do"), text: z.string().min(1).max(4000) }),
  /** Inner monologue. NPCs never hear it. */
  z.object({ kind: z.literal("think"), text: z.string().min(1).max(4000) }),
  z.object({ kind: z.literal("silent") }),
  z.object({ kind: z.literal("emotion"), emotion: EmotionIdSchema, intensity: z.number().int().min(1).max(5).default(3) }),
  z.object({ kind: z.literal("ability"), abilityId: z.string().min(1), target: z.string().max(500).optional() }),
  z.object({
    kind: z.literal("item"),
    itemId: z.string().min(1),
    mode: z.enum(["use", "equip", "unequip", "show", "give"]).default("use"),
    target: z.string().max(500).optional(),
  }),
  z.object({ kind: z.literal("travel"), locationId: z.string().min(1) }),
  z.object({ kind: z.literal("rest"), activity: z.enum(["wait", "sleep", "train", "study"]), minutes: z.number().int().min(5).max(60 * 24 * 7) }),
  z.object({ kind: z.literal("free"), text: z.string().min(1).max(4000) }),
]);
export type ActionPart = z.infer<typeof ActionPartSchema>;

/** A player turn: one or more combined parts ("Промолчать + Усмехнуться"). */
export const PlayerActionSchema = z.object({
  parts: z.array(ActionPartSchema).min(1).max(8),
});
export type PlayerAction = z.infer<typeof PlayerActionSchema>;

export function emotionLabel(id: EmotionId): string {
  return EMOTIONS.find((e) => e.id === id)?.label ?? id;
}

const INTENSITY = ["едва заметно", "слегка", "заметно", "сильно", "крайне"];
export function intensityLabel(intensity: number): string {
  return INTENSITY[Math.min(4, Math.max(0, intensity - 1))] ?? "заметно";
}
