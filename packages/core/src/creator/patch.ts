import { z } from "zod";
import { ScenarioSchema, type Scenario } from "../domain/scenario";

export const PATCH_COLLECTIONS = ["locations", "npcs", "factions", "abilities", "items", "lore", "quests", "timeline"] as const;
export type PatchCollection = (typeof PATCH_COLLECTIONS)[number];

/** Allowed top-level paths for `set` operations. Keeps the AI from rewriting ids/metadata freely. */
const SETTABLE_ROOTS = ["metadata", "tags", "world", "calendar", "mechanics", "system", "characterCreation", "start", "rules", "storyHooks"] as const;

export const PatchOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), path: z.string().min(1), value: z.unknown() }),
  z.object({ op: z.literal("add"), collection: z.enum(PATCH_COLLECTIONS), value: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal("update"), collection: z.enum(PATCH_COLLECTIONS), id: z.string(), value: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal("remove"), collection: z.enum(PATCH_COLLECTIONS), id: z.string() }),
]);
export type PatchOperation = z.infer<typeof PatchOperationSchema>;

/** A proposed change to a scenario draft. Never applied without the author's confirmation. */
export const ScenarioPatchSchema = z.object({
  title: z.string().default("Предложение"),
  summary: z.string().default(""),
  operations: z.array(PatchOperationSchema).min(1),
});
export type ScenarioPatch = z.infer<typeof ScenarioPatchSchema>;

export type PatchResult = { ok: true; scenario: Scenario } | { ok: false; errors: string[] };

function setPath(target: Record<string, unknown>, path: string, value: unknown): string | null {
  const parts = path.split(".");
  const root = parts[0];
  if (!root || !(SETTABLE_ROOTS as readonly string[]).includes(root)) return `Нельзя изменять «${path}»`;
  let node: Record<string, unknown> = target;
  for (const key of parts.slice(0, -1)) {
    const next = node[key];
    if (typeof next !== "object" || next === null || Array.isArray(next)) return `Путь «${path}» не найден`;
    node = next as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (!last) return `Пустой путь`;
  node[last] = value;
  return null;
}

/** Applies a patch to a copy of the scenario and re-validates the whole result with Zod. */
export function applyPatch(scenario: Scenario, patch: ScenarioPatch): PatchResult {
  const draft = structuredClone(scenario) as unknown as Record<string, unknown>;
  const errors: string[] = [];
  for (const op of patch.operations) {
    if (op.op === "set") {
      const err = setPath(draft, op.path, op.value);
      if (err) errors.push(err);
      continue;
    }
    const list = draft[op.collection] as Record<string, unknown>[];
    if (op.op === "add") {
      if (list.some((x) => x.id === op.value.id)) errors.push(`«${String(op.value.id)}» уже существует в ${op.collection}`);
      else list.push(op.value);
    } else if (op.op === "update") {
      const index = list.findIndex((x) => x.id === op.id);
      if (index === -1) errors.push(`«${op.id}» не найден в ${op.collection}`);
      else list[index] = { ...list[index], ...op.value, id: op.id };
    } else {
      const index = list.findIndex((x) => x.id === op.id);
      if (index === -1) errors.push(`«${op.id}» не найден в ${op.collection}`);
      else list.splice(index, 1);
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  const parsed = ScenarioSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`) };
  return { ok: true, scenario: parsed.data };
}
