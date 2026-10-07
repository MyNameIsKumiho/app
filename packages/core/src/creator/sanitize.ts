import { AIError } from "../ai/types";
import { IdSchema, slugify, uniqueId } from "../domain/common";
import { ScenarioSchema, type Scenario } from "../domain/scenario";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Models write `null` for "not applicable" (e.g. no fandom); the schema expects the field to be absent. */
function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((v) => v !== null).map(dropNulls);
  if (!isObj(value)) return value;
  const out: Obj = {};
  for (const [k, v] of Object.entries(value)) if (v !== null) out[k] = dropNulls(v);
  return out;
}

/** Removes the value at `path` (an entry of an array or a key of an object). Returns false if it cannot. */
function removeAt(root: Obj, path: PropertyKey[]): boolean {
  if (path.length < 2) return false;
  let parent: unknown = root;
  for (const key of path.slice(0, -1)) {
    parent = (parent as Record<PropertyKey, unknown> | undefined)?.[key];
    if (parent === undefined || parent === null) return false;
  }
  const last = path[path.length - 1];
  if (Array.isArray(parent) && typeof last === "number") {
    parent.splice(last, 1);
    return true;
  }
  if (isObj(parent) && typeof last === "string" && last in parent) {
    delete parent[last];
    return true;
  }
  return false;
}

const COLLECTIONS = ["locations", "npcs", "factions", "abilities", "items", "lore", "quests", "timeline"] as const;
const CONDITION_TYPES = new Set(["flag", "npc_alive", "quest_status", "player_at", "relationship_at_least"]);
const EFFECT_TYPES = new Set(["resource", "stat", "status", "flag"]);

/** Resolves ids that the AI wrote as names ("Лира Венн" -> "lira-venn"). */
class RefResolver {
  private readonly byKey = new Map<string, string>();
  constructor(items: Obj[]) {
    for (const item of items) {
      const id = str(item.id);
      this.byKey.set(id, id);
      const label = str(item.name) || str(item.title);
      if (label) {
        this.byKey.set(label.toLowerCase(), id);
        this.byKey.set(slugify(label), id);
      }
    }
  }
  resolve(ref: unknown): string | undefined {
    const s = str(ref);
    if (!s) return undefined;
    return this.byKey.get(s) ?? this.byKey.get(s.toLowerCase()) ?? this.byKey.get(slugify(s));
  }
  resolveAll(refs: unknown): string[] {
    return arr(refs).map((r) => this.resolve(r)).filter((x): x is string => x !== undefined);
  }
}

function normalizeCollection(raw: unknown): Obj[] {
  const taken: string[] = [];
  return arr(raw)
    .filter(isObj)
    .map((item, index) => {
      const label = str(item.name) || str(item.title) || `item-${index + 1}`;
      const current = str(item.id);
      const id = current && IdSchema.safeParse(current).success && !taken.includes(current) ? current : uniqueId(current || label, taken);
      taken.push(id);
      return { ...item, id };
    });
}

/**
 * Turns an AI-generated (possibly sloppy) scenario JSON into a valid Scenario:
 * fixes ids, resolves name references, drops broken entries, fills defaults.
 */
export function sanitizeScenario(raw: unknown, id: string, authorName?: string): Scenario {
  const cleaned = dropNulls(raw);
  const input: Obj = isObj(cleaned) ? cleaned : {};
  for (const key of COLLECTIONS) input[key] = normalizeCollection(input[key]);
  const col = (key: (typeof COLLECTIONS)[number]) => input[key] as Obj[];

  if (col("locations").length === 0) {
    col("locations").push({ id: "start", name: "Начальная локация", description: str((input.start as Obj | undefined)?.situation) });
  }
  const locations = new RefResolver(col("locations"));
  const npcs = new RefResolver(col("npcs"));
  const factions = new RefResolver(col("factions"));
  const abilities = new RefResolver(col("abilities"));
  const items = new RefResolver(col("items"));
  const quests = new RefResolver(col("quests"));

  for (const loc of col("locations")) {
    loc.connections = arr(loc.connections)
      .map((c) => (isObj(c) ? { ...c, locationId: locations.resolve(c.locationId ?? c.name) } : { locationId: locations.resolve(c) }))
      .filter((c) => c.locationId !== undefined);
  }
  for (const npc of col("npcs")) {
    npc.startingLocationId = locations.resolve(npc.startingLocationId);
    npc.factionIds = factions.resolveAll(npc.factionIds);
    npc.abilityIds = abilities.resolveAll(npc.abilityIds);
    npc.secrets = normalizeCollection(arr(npc.secrets).map((s) => (isObj(s) ? s : { description: str(s), name: str(s).slice(0, 30) })));
    npc.relationships = arr(npc.relationships).filter(isObj).map((r) => ({ ...r, targetId: npcs.resolve(r.targetId) ?? slugify(str(r.targetId)) }));
    if (!isObj(npc.startingRelationship)) delete npc.startingRelationship;
  }
  for (const f of col("factions")) {
    f.leaderId = npcs.resolve(f.leaderId);
    f.memberIds = npcs.resolveAll(f.memberIds);
    f.allyIds = factions.resolveAll(f.allyIds);
    f.enemyIds = factions.resolveAll(f.enemyIds);
  }
  for (const a of col("abilities")) {
    a.effects = arr(a.effects).filter((e) => isObj(e) && EFFECT_TYPES.has(str(e.type)));
    if (isObj(a.requirements)) {
      a.requirements.abilityIds = abilities.resolveAll(a.requirements.abilityIds);
      a.requirements.itemIds = items.resolveAll(a.requirements.itemIds);
    }
  }
  for (const it of col("items")) it.effects = arr(it.effects).filter((e) => isObj(e) && EFFECT_TYPES.has(str(e.type)));
  for (const lore of col("lore")) lore.relatedIds = arr(lore.relatedIds).map(str).map((s) => slugify(s));
  for (const q of col("quests")) {
    q.giverNpcId = npcs.resolve(q.giverNpcId);
    q.objectives = normalizeCollection(arr(q.objectives).map((o) => (isObj(o) ? { ...o, name: str(o.description) } : { description: str(o), name: str(o) })));
    if (isObj(q.rewards)) q.rewards.items = arr(q.rewards.items).filter(isObj).map((r) => ({ ...r, itemId: items.resolve(r.itemId) })).filter((r) => r.itemId);
  }
  for (const e of col("timeline")) {
    e.participants = npcs.resolveAll(e.participants);
    e.locationId = locations.resolve(e.locationId);
    e.conditions = arr(e.conditions).filter((c) => isObj(c) && CONDITION_TYPES.has(str(c.type)));
    e.effects = arr(e.effects).filter((x) => isObj(x) && EFFECT_TYPES.has(str(x.type)));
    if (!isObj(e.date)) e.date = { year: 1 };
  }

  const start: Obj = isObj(input.start) ? input.start : {};
  start.locationId = locations.resolve(start.locationId) ?? str(col("locations")[0]?.id);
  const date = isObj(start.date) ? start.date : {};
  start.date = { year: Number(date.year) || 1, month: Number(date.month) || 1, day: Number(date.day) || 1, hour: Number(date.hour) || 8, minute: 0 };
  start.activeQuestIds = quests.resolveAll(start.activeQuestIds);
  start.playerSecrets = normalizeCollection(arr(start.playerSecrets).map((s) => (isObj(s) ? s : { description: str(s), name: str(s).slice(0, 30) })));
  input.start = start;

  if (isObj(input.characterCreation)) {
    const cc = input.characterCreation;
    cc.startingAbilityIds = abilities.resolveAll(cc.startingAbilityIds);
    cc.startingItems = arr(cc.startingItems).filter(isObj).map((x) => ({ ...x, itemId: items.resolve(x.itemId) })).filter((x) => x.itemId);
    if (Array.isArray(cc.fields)) {
      const fields = normalizeCollection(cc.fields.map((f) => (isObj(f) ? { ...f, name: str(f.label) } : f)));
      if (!fields.some((f) => f.id === "name")) fields.unshift({ id: "name", label: "Имя", type: "text", required: true });
      cc.fields = fields.map((f) => ({ ...f, options: arr(f.options).filter(isObj).filter((o) => str(o.value) && str(o.label)) }));
    }
  }

  const metadata: Obj = isObj(input.metadata) ? input.metadata : {};
  metadata.title = str(metadata.title) || "Новый сценарий";
  if (authorName) metadata.authorName = authorName;
  input.metadata = metadata;
  input.id = id;
  delete input.formatVersion;

  // Last resort: drop the individual entries or optional fields that still fail validation.
  for (let attempt = 0; attempt < 60; attempt++) {
    const parsed = ScenarioSchema.safeParse(input);
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    const [root, index] = issue?.path ?? [];
    if (typeof root === "string" && (COLLECTIONS as readonly string[]).includes(root) && typeof index === "number") {
      (input[root] as unknown[]).splice(index, 1);
      continue;
    }
    if (typeof root === "string" && root !== "metadata" && root !== "start" && root !== "id") {
      delete input[root];
      continue;
    }
    // A broken optional field inside metadata or start (fandom, a date part…): drop it and let defaults apply.
    if (issue && root !== "id" && issue.path.join(".") !== "metadata.title" && removeAt(input, issue.path)) continue;
    throw new AIError("invalid_output", `Не удалось собрать сценарий: поле ${issue?.path.join(".")}: ${issue?.message}`);
  }
  return ScenarioSchema.parse(input);
}
