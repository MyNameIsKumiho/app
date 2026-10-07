/**
 * Provider-independent AI contracts. Game logic depends only on these types,
 * never on a concrete vendor SDK or model name.
 */

export type AIPurpose =
  | "story_turn"
  | "summarize"
  | "scenario_questions"
  | "scenario_draft"
  | "scenario_revise"
  | "scenario_alternatives"
  | "field_assist"
  | "editor_assistant"
  | "scenario_review"
  | "character";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TextRequest {
  purpose: AIPurpose;
  system: string;
  messages: AIMessage[];
  /** 0..1, providers map it to their own range or ignore it when unsupported. */
  temperature?: number;
  maxOutputTokens?: number;
  /** Ask the provider to return a single JSON object. */
  json?: boolean;
  /**
   * Structured hints for the deterministic mock provider (it cannot read
   * prompts like a model). Real providers ignore this field.
   */
  mockPayload?: unknown;
  signal?: AbortSignal;
}

export interface TextResult {
  text: string;
  providerId: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export type ProviderKind = "api" | "subscription" | "mock";

export interface ProviderStatus {
  id: string;
  label: string;
  kind: ProviderKind;
  available: boolean;
  /** Human explanation shown in Settings (never contains secrets). */
  detail: string;
}

export interface AIProvider {
  readonly id: string;
  readonly label: string;
  readonly kind: ProviderKind;
  status(): Promise<ProviderStatus>;
  generateText(request: TextRequest): Promise<TextResult>;
}

export type AIErrorCode =
  | "not_configured"
  | "auth"
  | "rate_limit"
  | "quota"
  | "unavailable"
  | "timeout"
  | "invalid_request"
  | "invalid_output"
  | "refused"
  | "unknown";

/** Errors worth retrying on another provider. */
export const FALLBACK_ERROR_CODES: ReadonlySet<AIErrorCode> = new Set(["not_configured", "auth", "rate_limit", "quota", "unavailable", "timeout", "refused", "unknown"]);

export class AIError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
    public readonly providerId?: string,
  ) {
    super(message);
    this.name = "AIError";
  }
}

/** Strips anything that looks like a credential before logging or showing an error. */
export function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/(api[_-]?key|authorization|x-api-key)["'\s:=]+[^\s"',}]+/gi, "$1=***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***");
}
