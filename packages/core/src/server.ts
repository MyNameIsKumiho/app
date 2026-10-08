/**
 * Server-only entry point. Never import this from client components:
 * it pulls in vendor SDKs, child_process (Codex CLI) and API-key handling.
 */
export * from "./index";
export * from "./ai/types";
export { AIRouter, type RouterSettings, type RouterEvent } from "./ai/router";
export { generateStructured, parseStructured, extractJson, repairJson, type TextGenerator } from "./ai/structured";
export * from "./ai/operations";
export { ClaudeProvider, DEFAULT_CLAUDE_MODEL, CLAUDE_SPEED_PRESETS } from "./ai/providers/claudeProvider";
export { OpenAIProvider, DEFAULT_OPENAI_MODEL, OPENAI_SPEED_PRESETS } from "./ai/providers/openaiProvider";
export { CodexCliProvider, CODEX_SPEED_EFFORT } from "./ai/providers/codexCliProvider";
export { MockProvider } from "./ai/providers/mock/mockProvider";
export * from "./image/imageProvider";
export { buildStoryContext, buildStorytellerSystem, estimateTokens, type BuiltContext } from "./context/contextEngine";
export * from "./memory/memoryEngine";
export { createGameState, CharacterValidationError } from "./scenario/createGame";
export * from "./scenario/packageFormat";
export { sanitizeScenario } from "./creator/sanitize";
export { playTurn, type PlayedTurn, type PlayTurnOptions } from "./story/playTurn";
export { prepareTurn, finalizeTurn } from "./engine/turn";
export { createAetherfallAcademy } from "./demo/aetherfallAcademy";
