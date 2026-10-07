/**
 * Client-safe entry point: domain types, schemas and pure helpers.
 * Server-only code (AI providers, CLI access, image generation) lives in ./server.ts.
 */
export * from "./domain/common";
export * from "./domain/time";
export * from "./domain/scenario";
export * from "./domain/gameState";
export * from "./domain/actions";
export * from "./domain/turnResult";
export { describeRelationship, relationLabel, type RelationshipView } from "./engine/relationships";
export { xpToNextLevel } from "./engine/progression";
export { effectiveStats, findItem } from "./engine/mutations";
export { abilityBlocker, findAbility } from "./engine/actions";
export { timelineView, type TimelineView } from "./engine/timeline";
export { presentNpcIds } from "./engine/world";
export { validateScenario, type ValidationIssue, type ValidationReport, type IssueLevel } from "./scenario/validator";
export { compileRules } from "./scenario/rulesCompiler";
export { CharacterInputSchema, validateCharacter, type CharacterInput } from "./scenario/createGame";
export { applyPatch, ScenarioPatchSchema, type ScenarioPatch, type PatchOperation } from "./creator/patch";
export { FIELD_ACTION_LABELS, type FieldAction } from "./creator/fieldActions";
export type { IllustrationMode, ImageKind } from "./image/types";
