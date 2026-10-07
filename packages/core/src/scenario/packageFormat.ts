import { z } from "zod";
import { APP_VERSION, SCENARIO_FORMAT_VERSION, type Scenario } from "../domain/scenario";
import { GAME_STATE_VERSION, GameStateSchema, type GameState } from "../domain/gameState";

/**
 * `.scenario` package: a self-describing JSON file people can share without a
 * marketplace. Older packages are upgraded by the migration chain below.
 */
export const SCENARIO_PACKAGE_FORMAT = "aetherfall.scenario";

export const ScenarioPackageSchema = z.object({
  format: z.literal(SCENARIO_PACKAGE_FORMAT),
  formatVersion: z.number().int().min(1),
  exportedAt: z.string(),
  appVersion: z.string(),
  scenario: z.record(z.string(), z.unknown()),
});
export type ScenarioPackage = z.infer<typeof ScenarioPackageSchema>;

type RawScenario = Record<string, unknown>;

/** formatVersion N -> N+1. Add a function here whenever the Scenario shape changes. */
export const SCENARIO_MIGRATIONS: Record<number, (raw: RawScenario) => RawScenario> = {
  // Example for the future:
  // 1: (raw) => ({ ...raw, formatVersion: 2, newField: defaultValue }),
};

export function migrateScenarioData(raw: RawScenario, fromVersion: number): RawScenario {
  let data = raw;
  for (let v = fromVersion; v < SCENARIO_FORMAT_VERSION; v++) {
    const step = SCENARIO_MIGRATIONS[v];
    if (!step) throw new Error(`Нет миграции сценария с версии формата ${v}`);
    data = step(data);
  }
  return { ...data, formatVersion: SCENARIO_FORMAT_VERSION };
}

export function exportScenario(scenario: Scenario): string {
  const pkg: ScenarioPackage = {
    format: SCENARIO_PACKAGE_FORMAT,
    formatVersion: SCENARIO_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    scenario: scenario as unknown as Record<string, unknown>,
  };
  return JSON.stringify(pkg, null, 2);
}

export class ScenarioImportError extends Error {}

/** Parses a `.scenario` file (or a bare scenario JSON) and returns raw, migrated scenario data. */
export function readScenarioPackage(text: string): RawScenario {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ScenarioImportError("Файл не является JSON.");
  }
  const pkg = ScenarioPackageSchema.safeParse(data);
  if (pkg.success) {
    if (pkg.data.formatVersion > SCENARIO_FORMAT_VERSION) throw new ScenarioImportError(`Сценарий создан в более новой версии приложения (формат ${pkg.data.formatVersion}). Обновите приложение.`);
    return migrateScenarioData(pkg.data.scenario, pkg.data.formatVersion);
  }
  if (typeof data === "object" && data !== null && "metadata" in data) {
    const raw = data as RawScenario;
    return migrateScenarioData(raw, typeof raw.formatVersion === "number" ? raw.formatVersion : 1);
  }
  throw new ScenarioImportError("Это не файл сценария Aetherfall.");
}

/** GameState stateVersion N -> N+1. Saves keep working after app updates. */
export const GAME_STATE_MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export function migrateGameState(raw: unknown): GameState {
  let data = raw as Record<string, unknown>;
  const from = typeof data.stateVersion === "number" ? data.stateVersion : 1;
  for (let v = from; v < GAME_STATE_VERSION; v++) {
    const step = GAME_STATE_MIGRATIONS[v];
    if (!step) throw new Error(`Нет миграции сохранения с версии ${v}`);
    data = step(data);
  }
  return GameStateSchema.parse({ ...data, stateVersion: GAME_STATE_VERSION });
}

export function bumpVersion(version: string, kind: "minor" | "major" | "patch" = "minor"): string {
  const [major = 1, minor = 0, patch = 0] = version.split(".").map((n) => Number.parseInt(n, 10) || 0);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Creates an editable copy that remembers where it came from ("Based on scenario by ..."). */
export function remixScenario(original: Scenario, input: { newId: string; title?: string; authorName: string }): Scenario {
  if (!original.metadata.allowRemix) throw new Error("Автор запретил ремиксы этого сценария.");
  const copy = structuredClone(original);
  copy.id = input.newId;
  copy.version = "1.0.0";
  copy.metadata.title = input.title?.trim() || `${original.metadata.title} — Remix`;
  copy.metadata.authorName = input.authorName;
  copy.metadata.originalScenarioId = original.id;
  copy.metadata.originalAuthor = original.metadata.authorName;
  return copy;
}
