import Anthropic from "@anthropic-ai/sdk";
import { AIError, redactSecrets, type AIProvider, type AISpeed, type ProviderStatus, type TextRequest, type TextResult } from "../types";

export interface ClaudeProviderOptions {
  apiKey?: string;
  model?: string;
  /** Effort for routine story turns; Opus 5.5 defaults to "medium". */
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
}

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

/** Model and effort per speed tier. A model set on the server (ANTHROPIC_MODEL) replaces the preset model. */
export const CLAUDE_SPEED_PRESETS: Record<AISpeed, { model: string; effort: "low" | "medium" | "high" }> = {
  fast: { model: "claude-sonnet-5-5", effort: "low" },
  balanced: { model: "claude-opus-5-5", effort: "medium" },
  smart: { model: "claude-opus-5-5", effort: "high" },
};

function mapError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return new AIError("auth", "Claude API: ключ недействителен или нет доступа", "claude");
  if (error instanceof Anthropic.RateLimitError) return new AIError("rate_limit", "Claude API: превышен лимит запросов", "claude");
  if (error instanceof Anthropic.BadRequestError) {
    const msg = redactSecrets(error.message);
    return new AIError(/credit|billing|balance/i.test(msg) ? "quota" : "invalid_request", `Claude API: ${msg}`, "claude");
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new AIError("timeout", "Claude API: превышено время ожидания", "claude");
  if (error instanceof Anthropic.APIConnectionError) return new AIError("unavailable", "Claude API недоступен (сеть)", "claude");
  if (error instanceof Anthropic.InternalServerError) return new AIError("unavailable", "Claude API временно недоступен", "claude");
  if (error instanceof Anthropic.APIError) return new AIError("unknown", `Claude API: ${redactSecrets(error.message)}`, "claude");
  return new AIError("unknown", redactSecrets(error instanceof Error ? error.message : String(error)), "claude");
}

/** Claude via the official Anthropic SDK (API key, server-side only). */
export class ClaudeProvider implements AIProvider {
  readonly id = "claude";
  readonly label = "Claude API";
  readonly kind = "api" as const;
  private client: Anthropic | null;
  private readonly model: string;

  constructor(private readonly options: ClaudeProviderOptions) {
    this.client = options.apiKey ? new Anthropic({ apiKey: options.apiKey, timeout: options.timeoutMs ?? 120_000, maxRetries: 1 }) : null;
    this.model = options.model || DEFAULT_CLAUDE_MODEL;
  }

  private pick(request: TextRequest): { model: string; effort: "low" | "medium" | "high" } {
    if (!request.speed) return { model: request.model || this.model, effort: this.options.effort ?? "medium" };
    const preset = CLAUDE_SPEED_PRESETS[request.speed];
    return { model: request.model || this.options.model || preset.model, effort: preset.effort };
  }

  async status(): Promise<ProviderStatus> {
    return {
      id: this.id,
      label: this.label,
      kind: this.kind,
      available: this.client !== null,
      detail: this.client ? `Модель ${this.model}, ключ задан на сервере` : "Не задан ANTHROPIC_API_KEY на сервере",
    };
  }

  async generateText(request: TextRequest): Promise<TextResult> {
    if (!this.client) throw new AIError("not_configured", "Claude API не настроен", this.id);
    const { model, effort } = this.pick(request);
    try {
      const stream = this.client.beta.messages.stream(
        {
          model,
          max_tokens: request.maxOutputTokens ?? 8000,
          system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
          output_config: { effort },
          // Server-side refusal fallback, routed by refusal category.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal: request.signal },
      );
      const message = await stream.finalMessage();
      if (message.stop_reason === "refusal") throw new AIError("refused", "Claude отказался отвечать на этот запрос", this.id);
      const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
      if (!text.trim()) throw new AIError("invalid_output", "Claude вернул пустой ответ", this.id);
      return {
        text,
        providerId: this.id,
        model: message.model,
        usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
      };
    } catch (error) {
      throw mapError(error);
    }
  }
}
