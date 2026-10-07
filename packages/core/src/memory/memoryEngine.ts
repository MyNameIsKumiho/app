import { PERMANENT_IMPORTANCE } from "../domain/common";
import { nextId, type GameState, type LogEntry, type Memory, type NPCState, type Summary } from "../domain/gameState";

/**
 * Layered memory:
 *   recent (raw turns) → scene summaries → arc summaries
 *   long-term memory (scored events) + permanent facts (importance ≥ 80, never pruned)
 *   per-NPC memories (only what that NPC witnessed or was told)
 */

export const SCENE_SUMMARY_LIMIT = 6;
export const ARC_SUMMARY_LIMIT = 10;
export const LONG_TERM_LIMIT = 80;
export const NPC_MEMORY_LIMIT = 40;

export interface SummaryRequest {
  kind: "scene" | "arc";
  title: string;
  /** Plain text to summarize (turn log or lower-level summaries). */
  text: string;
}

export interface SummaryResponse {
  title: string;
  summary: string;
  /** Facts that must survive summarization; importance ≥ 50 go to long-term memory. */
  keyFacts: { text: string; importance: number }[];
}

export type Summarizer = (request: SummaryRequest) => Promise<SummaryResponse>;

/** Score used for pruning and retrieval: importance dominates, recency breaks ties. */
function retentionScore(memory: Memory, newestTurn: number): number {
  const age = Math.max(0, newestTurn - memory.turn);
  return memory.importance + Math.abs(memory.emotionalImpact) * 0.2 - age * 0.5;
}

/** Drops the least valuable memories; permanent ones (importance ≥ 80) are always kept. */
export function pruneMemories(memories: Memory[], limit: number, currentTurn: number): Memory[] {
  if (memories.length <= limit) return memories;
  const permanent = memories.filter((m) => m.importance >= PERMANENT_IMPORTANCE);
  const rest = memories
    .filter((m) => m.importance < PERMANENT_IMPORTANCE)
    .sort((a, b) => retentionScore(b, currentTurn) - retentionScore(a, currentTurn))
    .slice(0, Math.max(0, limit - permanent.length));
  const keep = new Set([...permanent, ...rest]);
  return memories.filter((m) => keep.has(m));
}

export function pruneNpc(npc: NPCState, currentTurn: number): void {
  npc.memories = pruneMemories(npc.memories, NPC_MEMORY_LIMIT, currentTurn);
}

export function permanentFacts(state: GameState): Memory[] {
  return state.memory.longTerm.filter((m) => m.importance >= PERMANENT_IMPORTANCE);
}

const STOP_WORDS = new Set(["и", "в", "на", "с", "что", "это", "как", "не", "по", "к", "у", "из", "за", "о", "the", "a", "to", "of"]);

export function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
      .map((w) => w.slice(0, 6)), // crude stemming for Russian inflections
  );
}

/** Memories most relevant to the current situation (keyword overlap + importance + recency). */
export function relevantMemories(memories: Memory[], query: Set<string>, limit: number, currentTurn: number): Memory[] {
  return [...memories]
    .map((m) => {
      const overlap = [...keywords(m.event)].filter((k) => query.has(k)).length;
      return { m, score: retentionScore(m, currentTurn) + overlap * 15 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m)
    .sort((a, b) => a.turn - b.turn);
}

function logToText(entries: LogEntry[]): string {
  return entries.map((e) => `[Ход ${e.turn}] ${e.action ? `Игрок: ${e.action}\n` : ""}${e.narrative}`).join("\n\n");
}

/** Deterministic fallback summarizer: used when no AI is available or summarization fails. */
export const extractiveSummarizer: Summarizer = async (request) => {
  const sentences = request.text
    .replace(/\[Ход \d+\]/g, "")
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && !s.startsWith("—"));
  const picked = sentences.filter((_, i) => i % Math.max(1, Math.ceil(sentences.length / 6)) === 0).slice(0, 6);
  return { title: request.title, summary: picked.join(" ") || request.text.slice(0, 400), keyFacts: [] };
};

async function summarizeSafely(summarizer: Summarizer, request: SummaryRequest): Promise<SummaryResponse> {
  try {
    return await summarizer(request);
  } catch {
    return extractiveSummarizer(request);
  }
}

function storeKeyFacts(state: GameState, facts: SummaryResponse["keyFacts"], fromTurn: number): void {
  for (const fact of facts) {
    if (fact.importance < 50) continue;
    const exists = state.memory.longTerm.some((m) => m.event === fact.text);
    if (exists) continue;
    state.memory.longTerm.push({
      id: nextId(state, "mem"),
      event: fact.text,
      importance: Math.min(100, Math.max(0, Math.round(fact.importance))),
      emotionalImpact: 0,
      timestamp: state.clock,
      turn: fromTurn,
      participants: [],
    });
  }
}

export interface CompactOptions {
  /** Raw turns that left the recent window. */
  overflow: LogEntry[];
  /** Start a new arc after this turn (closes the current one). */
  newArcTitle?: string;
}

/** Folds old context into summaries so prompts stay small. Never loses permanent facts. */
export async function compactMemory(state: GameState, summarizer: Summarizer, options: CompactOptions): Promise<void> {
  const mem = state.memory;
  const first = options.overflow[0];
  const last = options.overflow[options.overflow.length - 1];
  if (first && last) {
    const res = await summarizeSafely(summarizer, { kind: "scene", title: mem.currentScene.title, text: logToText(options.overflow) });
    mem.sceneSummaries.push({ id: nextId(state, "scene"), title: res.title || mem.currentScene.title, text: res.summary, fromTurn: first.turn, toTurn: last.turn });
    storeKeyFacts(state, res.keyFacts, first.turn);
  }

  const closeArc = async (title: string, scenes: Summary[]) => {
    const head = scenes[0];
    const tail = scenes[scenes.length - 1];
    if (!head || !tail) return;
    const res = await summarizeSafely(summarizer, { kind: "arc", title, text: scenes.map((s) => `${s.title}: ${s.text}`).join("\n") });
    mem.arcSummaries.push({ id: nextId(state, "arc"), title: res.title || title, text: res.summary, fromTurn: head.fromTurn, toTurn: tail.toTurn });
    storeKeyFacts(state, res.keyFacts, head.fromTurn);
  };

  if (options.newArcTitle) {
    await closeArc(mem.currentArc.title, mem.sceneSummaries.splice(0));
    state.journal.entries.push({ id: nextId(state, "journal"), kind: "event", text: `Завершена арка «${mem.currentArc.title}». Началась «${options.newArcTitle}».`, turn: state.turn, timestamp: state.clock });
    mem.currentArc = { title: options.newArcTitle, startedAtTurn: state.turn };
  } else if (mem.sceneSummaries.length > SCENE_SUMMARY_LIMIT) {
    await closeArc(`${mem.currentArc.title} (часть ${mem.arcSummaries.length + 1})`, mem.sceneSummaries.splice(0, SCENE_SUMMARY_LIMIT - 2));
  }

  while (mem.arcSummaries.length > ARC_SUMMARY_LIMIT) {
    const [a, b] = mem.arcSummaries.splice(0, 2);
    if (!a || !b) break;
    const res = await summarizeSafely(summarizer, { kind: "arc", title: `${a.title} / ${b.title}`, text: `${a.text}\n${b.text}` });
    mem.arcSummaries.unshift({ id: nextId(state, "arc"), title: res.title || a.title, text: res.summary, fromTurn: a.fromTurn, toTurn: b.toTurn });
    storeKeyFacts(state, res.keyFacts, a.fromTurn);
  }

  mem.longTerm = pruneMemories(mem.longTerm, LONG_TERM_LIMIT, state.turn);
  for (const npc of Object.values(state.npcs)) pruneNpc(npc, state.turn);
}
