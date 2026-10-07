import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  MAX_USER_TEXT,
  GameStateSchema,
  PlayerActionSchema,
  buildImagePrompt,
  createGameState,
  formatGameTime,
  migrateGameState,
  playTurn,
  presentNpcIds,
  shouldIllustrate,
  type CharacterInput,
  type GameState,
  type ImageKind,
  type ImageProvider,
  type Scenario,
  type SuggestedAction,
  type TextGenerator,
} from "@aetherfall/core/server";
import { buildPlayerView } from "@/lib/playerView";
import type { PlayTurnResponse, SaveDTO, StoryCard, StoryDetail, TurnDTO, TurnReport } from "@/lib/types";
import type { DB } from "./db/client";
import { images, saves, stories, turns } from "./db/schema";
import { ApiError } from "./http";
import { ensureSnapshot, incrementPlays, latestVersion, loadScenario, loadSnapshot } from "./scenarios";
import type { AppSettings } from "./settings";

export interface StoryDeps {
  db: DB;
  ai: TextGenerator;
  images: ImageProvider;
  settings: AppSettings;
}

type StoryRow = typeof stories.$inferSelect;
type TurnRow = typeof turns.$inferSelect;

const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

// ---------------------------------------------------------------------------
// Per-story lock: one turn at a time, a double click never plays twice.
// ---------------------------------------------------------------------------

const globalForLocks = globalThis as unknown as { __aetherfallLocks?: Set<string> };
const locks = (globalForLocks.__aetherfallLocks ??= new Set<string>());

async function withStoryLock<T>(storyId: string, fn: () => Promise<T>): Promise<T> {
  if (locks.has(storyId)) throw new ApiError(409, "Предыдущий ход ещё обрабатывается");
  locks.add(storyId);
  try {
    return await fn();
  } finally {
    locks.delete(storyId);
  }
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function parseState(raw: unknown): GameState {
  // Old saves are migrated forward; never broken.
  return migrateGameState(raw);
}

function toTurnDTO(row: TurnRow): TurnDTO {
  const action = row.action ? PlayerActionSchema.safeParse(row.action) : null;
  return {
    id: row.id,
    parentId: row.parentId,
    number: row.number,
    action: action?.success ? action.data : null,
    actionSummary: row.actionSummary,
    narrative: row.narrative,
    suggestions: (row.suggestions as SuggestedAction[]) ?? [],
    report: (row.report as TurnReport | null) ?? null,
    ai: (row.ai as TurnDTO["ai"]) ?? null,
    imageId: row.imageId,
    createdAt: row.createdAt,
  };
}

function locationName(scenario: Scenario, state: GameState): string {
  return scenario.locations.find((l) => l.id === state.player.locationId)?.name ?? state.player.locationId;
}

function toStoryCard(row: StoryRow, scenario: Scenario): StoryCard {
  const state = parseState(row.state);
  return {
    id: row.id,
    scenarioId: row.scenarioId,
    title: row.title,
    characterName: row.characterName,
    turn: state.turn,
    location: locationName(scenario, state),
    updatedAt: row.updatedAt,
    alive: state.player.alive,
  };
}

function getStoryRow(db: DB, id: string): StoryRow {
  const row = db.select().from(stories).where(eq(stories.id, id)).get();
  if (!row) throw new ApiError(404, "История не найдена");
  return row;
}

function getTurnRow(db: DB, storyId: string, turnId: string): TurnRow {
  const row = db.select().from(turns).where(and(eq(turns.id, turnId), eq(turns.storyId, storyId))).get();
  if (!row) throw new ApiError(404, "Ход не найден в этой истории");
  return row;
}

/** Turns from the root to the head (the current branch). */
function branchTurns(db: DB, storyId: string, headId: string | null): TurnRow[] {
  const all = db.select().from(turns).where(eq(turns.storyId, storyId)).all();
  const byId = new Map(all.map((t) => [t.id, t]));
  const path: TurnRow[] = [];
  let cursor = headId ? byId.get(headId) : undefined;
  while (cursor) {
    path.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return path.reverse();
}

function openingSuggestions(scenario: Scenario, state: GameState): SuggestedAction[] {
  const result: SuggestedAction[] = [{ label: "Осмотреться", kind: "do", text: "Внимательно осматриваюсь вокруг" }];
  const npc = scenario.npcs.find((n) => presentNpcIds(state).includes(n.id));
  if (npc) result.push({ label: "Заговорить с кем-нибудь", kind: "say", text: "Простите, можно вас на минуту?" });
  result.push({ label: "Собраться с мыслями", kind: "think", text: "Где я и что мне теперь делать?" });
  const location = scenario.locations.find((l) => l.id === state.player.locationId);
  const next = location?.connections.map((c) => scenario.locations.find((l) => l.id === c.locationId)).find((l) => l && !l.hidden);
  if (next) result.push({ label: `Пойти: ${next.name}`, kind: "free", text: `Иду в ${next.name}` });
  return result;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function listStories(db: DB): StoryCard[] {
  const rows = db.select().from(stories).orderBy(desc(stories.updatedAt)).all();
  const cache = new Map<string, Scenario>();
  return rows.map((row) => {
    let scenario = cache.get(row.snapshotId);
    if (!scenario) {
      scenario = loadSnapshot(db, row.snapshotId);
      cache.set(row.snapshotId, scenario);
    }
    return toStoryCard(row, scenario);
  });
}

export function getStoryDetail(db: DB, id: string, settings: AppSettings): StoryDetail {
  const row = getStoryRow(db, id);
  const scenario = loadSnapshot(db, row.snapshotId);
  const state = parseState(row.state);
  return {
    story: { ...toStoryCard(row, scenario), scenarioVersion: row.scenarioVersion, latestScenarioVersion: latestVersion(db, row.scenarioId), headTurnId: row.headTurnId },
    turns: branchTurns(db, id, row.headTurnId).map(toTurnDTO),
    view: buildPlayerView(scenario, state),
    illustrationMode: settings.images.mode,
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export function createStory(db: DB, input: { scenarioId: string; character: CharacterInput }): { id: string } {
  const scenario = loadScenario(db, input.scenarioId);
  const state = createGameState(scenario, input.character);
  const snapshotId = ensureSnapshot(db, scenario);
  const storyId = newId("story");
  const turnId = newId("turn");
  const time = now();
  const opening = scenario.start.openingScene || scenario.start.situation || `${state.player.name} оказывается в месте под названием «${locationName(scenario, state)}».`;
  db.transaction((tx) => {
    tx.insert(stories)
      .values({
        id: storyId,
        scenarioId: scenario.id,
        snapshotId,
        scenarioVersion: scenario.version,
        title: scenario.metadata.title,
        characterName: state.player.name,
        state,
        headTurnId: turnId,
        createdAt: time,
        updatedAt: time,
      })
      .run();
    tx.insert(turns)
      .values({ id: turnId, storyId, parentId: null, number: 0, action: null, actionSummary: "", narrative: opening, suggestions: openingSuggestions(scenario, state), report: null, stateAfter: state, ai: null, createdAt: time })
      .run();
  });
  incrementPlays(db, scenario.id);
  return { id: storyId };
}

export function deleteStory(db: DB, id: string): void {
  getStoryRow(db, id);
  db.delete(stories).where(eq(stories.id, id)).run();
}

function writeAutosave(db: DB, row: StoryRow, scenario: Scenario, state: GameState, turnId: string, slots: number): void {
  const existing = db.select().from(saves).where(and(eq(saves.storyId, row.id), eq(saves.kind, "auto"))).orderBy(asc(saves.createdAt)).all();
  // Rotate: drop the oldest autosaves beyond the slot limit.
  for (const old of existing.slice(0, Math.max(0, existing.length - slots + 1))) db.delete(saves).where(eq(saves.id, old.id)).run();
  db.insert(saves)
    .values({
      id: newId("save"),
      storyId: row.id,
      kind: "auto",
      slot: 0,
      label: `Автосохранение · ход ${state.turn}`,
      turnId,
      turnNumber: state.turn,
      scenarioVersion: scenario.version,
      state,
      aiMeta: null,
      createdAt: now(),
    })
    .run();
}

export async function playStoryTurn(deps: StoryDeps, storyId: string, rawAction: unknown): Promise<PlayTurnResponse & { illustrate: boolean }> {
  const action = PlayerActionSchema.parse(rawAction);
  return withStoryLock(storyId, async () => {
    const { db, settings } = deps;
    const row = getStoryRow(db, storyId);
    const scenario = loadSnapshot(db, row.snapshotId);
    const state = parseState(row.state);
    if (!state.player.alive) throw new ApiError(409, "Герой погиб. Перемотайте историю назад или загрузите сохранение.");

    const played = await playTurn(deps.ai, scenario, state, action, { temperature: settings.ai.temperature, contextBudget: settings.ai.contextBudget });

    const turnId = newId("turn");
    const time = now();
    const report: TurnReport = {
      applied: played.report.applied,
      rejected: played.report.rejected.map((r) => ({ kind: r.kind, reason: r.reason })),
      levelUps: played.report.levelUps,
      completedQuestIds: played.report.completedQuestIds,
      outcomes: played.outcomes,
      failures: played.failures,
      timeline: played.timeline.map((t) => ({ title: t.title, status: t.status, description: t.description, witnessed: t.witnessed })),
    };
    const turnRow = {
      id: turnId,
      storyId,
      parentId: row.headTurnId,
      number: played.state.turn,
      action,
      actionSummary: played.actionSummary,
      narrative: played.narrative,
      suggestions: played.suggestedActions,
      report,
      stateAfter: played.state,
      ai: { providerId: played.ai.providerId, model: played.ai.model, attempts: played.ai.attempts, contextTokens: played.ai.contextTokens },
      imageId: null,
      createdAt: time,
    };
    // Keep the player's own notes across turns (they are not part of the story).
    played.state.journal.notes = state.journal.notes;
    db.transaction((tx) => {
      tx.insert(turns).values(turnRow).run();
      tx.update(stories).set({ state: played.state, headTurnId: turnId, updatedAt: time }).where(eq(stories.id, storyId)).run();
    });
    if (settings.gameplay.autosave) writeAutosave(db, row, scenario, played.state, turnId, settings.gameplay.autosaveSlots);

    const illustrate = shouldIllustrate(settings.images.mode, { worthy: played.illustration.worthy, turn: played.state.turn, lastIllustratedTurn: row.lastIllustratedTurn });
    return { turn: toTurnDTO(db.select().from(turns).where(eq(turns.id, turnId)).get()!), view: buildPlayerView(scenario, played.state), illustrate };
  });
}

/** Moves the story head to an earlier turn. Later turns stay as an abandoned branch. */
export function rewindStory(db: DB, storyId: string, turnId: string): void {
  const row = getStoryRow(db, storyId);
  if (locks.has(storyId)) throw new ApiError(409, "Дождитесь окончания текущего хода");
  const target = getTurnRow(db, storyId, turnId);
  const state = parseState(target.stateAfter);
  state.journal.notes = parseState(row.state).journal.notes;
  db.update(stories).set({ state, headTurnId: target.id, updatedAt: now() }).where(eq(stories.id, storyId)).run();
}

// ---------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------

export function listSaves(db: DB, storyId: string): SaveDTO[] {
  const row = getStoryRow(db, storyId);
  const scenario = loadSnapshot(db, row.snapshotId);
  return db
    .select()
    .from(saves)
    .where(eq(saves.storyId, storyId))
    .orderBy(desc(saves.createdAt))
    .all()
    .map((s) => {
      const state = parseState(s.state);
      return {
        id: s.id,
        kind: s.kind as SaveDTO["kind"],
        slot: s.slot,
        label: s.label,
        turnId: s.turnId,
        turnNumber: s.turnNumber,
        scenarioVersion: s.scenarioVersion,
        time: formatGameTime(state.time, scenario.calendar),
        location: locationName(scenario, state),
        createdAt: s.createdAt,
      };
    });
}

export function createManualSave(db: DB, storyId: string, input: { slot: number; label?: string }): SaveDTO[] {
  const row = getStoryRow(db, storyId);
  if (!row.headTurnId) throw new ApiError(409, "Нечего сохранять");
  const state = parseState(row.state);
  db.delete(saves).where(and(eq(saves.storyId, storyId), eq(saves.kind, "manual"), eq(saves.slot, input.slot))).run();
  db.insert(saves)
    .values({
      id: newId("save"),
      storyId,
      kind: "manual",
      slot: input.slot,
      label: input.label?.trim() || `Слот ${input.slot} · ход ${state.turn}`,
      turnId: row.headTurnId,
      turnNumber: state.turn,
      scenarioVersion: row.scenarioVersion,
      state,
      aiMeta: null,
      createdAt: now(),
    })
    .run();
  return listSaves(db, storyId);
}

/** Restores the exact saved GameState and moves the head to the saved turn. */
export function loadSave(db: DB, storyId: string, saveId: string): void {
  const row = getStoryRow(db, storyId);
  if (locks.has(storyId)) throw new ApiError(409, "Дождитесь окончания текущего хода");
  const save = db.select().from(saves).where(and(eq(saves.id, saveId), eq(saves.storyId, storyId))).get();
  if (!save) throw new ApiError(404, "Сохранение не найдено");
  const state = parseState(save.state);
  state.journal.notes = parseState(row.state).journal.notes;
  db.update(stories).set({ state, headTurnId: save.turnId, updatedAt: now() }).where(eq(stories.id, storyId)).run();
}

export function deleteSave(db: DB, storyId: string, saveId: string): void {
  db.delete(saves).where(and(eq(saves.id, saveId), eq(saves.storyId, storyId))).run();
}

// ---------------------------------------------------------------------------
// Player notes
// ---------------------------------------------------------------------------

function updateState(db: DB, storyId: string, fn: (state: GameState) => void): GameState {
  const row = getStoryRow(db, storyId);
  const state = GameStateSchema.parse(parseState(row.state));
  fn(state);
  db.update(stories).set({ state, updatedAt: now() }).where(eq(stories.id, storyId)).run();
  return state;
}

export function addNote(db: DB, storyId: string, text: string): void {
  const clean = text.trim().slice(0, MAX_USER_TEXT);
  if (!clean) throw new ApiError(400, "Пустая заметка");
  updateState(db, storyId, (state) => state.journal.notes.push({ id: newId("note"), text: clean, createdAt: now() }));
}

export function deleteNote(db: DB, storyId: string, noteId: string): void {
  updateState(db, storyId, (state) => {
    state.journal.notes = state.journal.notes.filter((n) => n.id !== noteId);
  });
}

// ---------------------------------------------------------------------------
// Illustrations
// ---------------------------------------------------------------------------

export async function illustrateTurn(deps: StoryDeps, storyId: string, turnId: string): Promise<{ imageId: string }> {
  const { db } = deps;
  if (deps.settings.images.mode === "never") throw new ApiError(409, "Иллюстрации выключены в настройках");
  const row = getStoryRow(db, storyId);
  const turn = getTurnRow(db, storyId, turnId);
  if (turn.imageId) return { imageId: turn.imageId };
  const scenario = loadSnapshot(db, row.snapshotId);
  const state = parseState(turn.stateAfter);
  const location = scenario.locations.find((l) => l.id === state.player.locationId);
  const characters = [
    { name: state.player.name, profile: state.player.visualProfile, appearance: state.player.fields.appearance },
    ...presentNpcIds(state)
      .map((id) => scenario.npcs.find((n) => n.id === id))
      .filter((n) => n !== undefined)
      .slice(0, 3)
      .map((n) => ({ name: n.name, profile: n.visualProfile, appearance: n.appearance })),
  ];
  const kind: ImageKind = "scene";
  const prompt = buildImagePrompt({ kind, subject: turn.narrative.slice(0, 600), setting: [location?.name, location?.visualDescription || location?.description].filter(Boolean).join(": "), characters });
  const image = await deps.images.generate({ kind, prompt, title: location?.name ?? scenario.metadata.title });
  const imageId = newId("img");
  db.transaction((tx) => {
    tx.insert(images).values({ id: imageId, storyId, scenarioId: scenario.id, kind, prompt, dataUri: image.dataUri, provider: image.providerId, createdAt: now() }).run();
    tx.update(turns).set({ imageId }).where(eq(turns.id, turnId)).run();
    tx.update(stories).set({ lastIllustratedTurn: turn.number }).where(eq(stories.id, storyId)).run();
  });
  return { imageId };
}

export function getImage(db: DB, imageId: string): { contentType: string; body: Buffer } {
  const row = db.select().from(images).where(eq(images.id, imageId)).get();
  if (!row) throw new ApiError(404, "Изображение не найдено");
  const match = /^data:([^;]+);base64,(.*)$/s.exec(row.dataUri);
  if (!match) throw new ApiError(500, "Повреждённое изображение");
  return { contentType: match[1]!, body: Buffer.from(match[2]!, "base64") };
}
