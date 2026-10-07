import type { PlayerAction, Scenario, SuggestedAction, ValidationReport } from "@aetherfall/core";
import type { PlayerView } from "./playerView";
import type { PublicScenario } from "./publicScenario";

/** DTOs shared by API routes and the UI. */

export interface ScenarioCard {
  id: string;
  title: string;
  shortDescription: string;
  authorName: string;
  version: string;
  status: "draft" | "private" | "published";
  origin: "original" | "fan";
  fandom: string;
  tags: string[];
  coverImage: string | null;
  isBuiltin: boolean;
  isOwn: boolean;
  inLibrary: boolean;
  favorite: boolean;
  plays: number;
  allowRemix: boolean;
  basedOn: { id: string; author: string; title: string | null } | null;
  updatedAt: string;
}

export interface ScenarioDetail {
  card: ScenarioCard;
  public: PublicScenario;
  /** Full data: only for the author's own scenarios (editing). */
  scenario: Scenario | null;
  validation: ValidationReport | null;
}

export interface TurnReport {
  applied: string[];
  rejected: { kind: string; reason: string }[];
  levelUps: number[];
  completedQuestIds: string[];
  outcomes: string[];
  failures: string[];
  timeline: { title: string; status: string; description: string; witnessed: boolean }[];
}

export interface TurnDTO {
  id: string;
  parentId: string | null;
  number: number;
  action: PlayerAction | null;
  actionSummary: string;
  narrative: string;
  suggestions: SuggestedAction[];
  report: TurnReport | null;
  ai: { providerId: string; model: string; attempts: number; contextTokens: number } | null;
  imageId: string | null;
  createdAt: string;
}

export interface SaveDTO {
  id: string;
  kind: "auto" | "manual";
  slot: number;
  label: string;
  turnId: string;
  turnNumber: number;
  scenarioVersion: string;
  time: string;
  location: string;
  createdAt: string;
}

export interface StoryCard {
  id: string;
  scenarioId: string;
  title: string;
  characterName: string;
  turn: number;
  location: string;
  updatedAt: string;
  alive: boolean;
}

export interface StoryDetail {
  story: StoryCard & { scenarioVersion: string; latestScenarioVersion: string | null; headTurnId: string | null };
  turns: TurnDTO[];
  view: PlayerView;
  illustrationMode: "never" | "manual" | "important" | "frequent";
}

export interface PlayTurnResponse {
  turn: TurnDTO;
  view: PlayerView;
}
