import OpenAI from "openai";
import { AIError, redactSecrets, type AIProvider, type AISpeed, type ProviderStatus, type TextRequest, type TextResult } from "../types";

export interface OpenAIProviderOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

export const DEFAULT_OPENAI_MODEL = "gpt-5";

/** Model and reasoning effort per speed tier. A model set on the server (OPENAI_MODEL) replaces the preset model. */
export const OPENAI_SPEED_PRESETS: Record<AISpeed, { model: string; effort: "low" | "medium" | "high" }> = {
  fast: { model: "gpt-5-mini", effort: "low" },
  balanced: { model: "gpt-5", effort: "low" },
  smart: { model: "gpt-5", effort: "high" },
};

function mapError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) return new AIError("auth", "OpenAI API: ключ недействителен", "openai");
  if (error instanceof OpenAI.RateLimitError) {
    const quota = /quota|billing/i.test(error.message);
    return new AIError(quota ? "quota" : "rate_limit", quota ? "OpenAI API: закончился лимит" : "OpenAI API: превышен лимит запросов", "openai");
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) return new AIError("timeout", "OpenAI API: превышено время ожидания", "openai");
  if (error instanceof OpenAI.APIConnectionError) return new AIError("unavailable", "OpenAI API недоступен (сеть)", "openai");
  if (error instanceof OpenAI.InternalServerError) return new AIError("unavailable", "OpenAI API временно недоступен", "openai");
  if (error instanceof OpenAI.BadRequestError) return new AIError("invalid_request", `OpenAI API: ${redactSecrets(error.message)}`, "openai");
  if (error instanceof OpenAI.APIError) return new AIError("unknown", `OpenAI API: ${redactSecrets(error.message)}`, "openai");
  return new AIError("unknown", redactSecrets(error instanceof Error ? error.message : String(error)), "openai");
}

/** OpenAI via the official SDK and the Responses API (API key, server-side only). */
export class OpenAIProvider implements AIProvider {
  readonly id = "openai";
  readonly label = "OpenAI API";
  readonly kind = "api" as const;
  private readonly client: OpenAI | null;
  private readonly model: string;
  private readonly serverModel: string | undefined;

  constructor(options: OpenAIProviderOptions) {
    this.client = options.apiKey ? new OpenAI({ apiKey: options.apiKey, timeout: options.timeoutMs ?? 120_000, maxRetries: 1 }) : null;
    this.model = options.model || DEFAULT_OPENAI_MODEL;
    this.serverModel = options.model || undefined;
  }

  async status(): Promise<ProviderStatus> {
    return {
      id: this.id,
      label: this.label,
      kind: this.kind,
      available: this.client !== null,
      detail: this.client ? `Модель ${this.model}, ключ задан на сервере` : "Не задан OPENAI_API_KEY на сервере",
    };
  }

  async generateText(request: TextRequest): Promise<TextResult> {
    if (!this.client) throw new AIError("not_configured", "OpenAI API не настроен", this.id);
    const preset = request.speed ? OPENAI_SPEED_PRESETS[request.speed] : null;
    const model = request.model || this.serverModel || preset?.model || this.model;
    try {
      const response = await this.client.responses.create(
        {
          model,
          ...(preset ? { reasoning: { effort: preset.effort } } : {}),
          instructions: request.system,
          input: request.messages.map((m) => ({ role: m.role, content: m.content })),
          max_output_tokens: request.maxOutputTokens ?? 8000,
          ...(request.json ? { text: { format: { type: "json_object" as const } } } : {}),
        },
        { signal: request.signal },
      );
      const text = response.output_text;
      if (!text?.trim()) throw new AIError("invalid_output", "OpenAI вернул пустой ответ", this.id);
      return {
        text,
        providerId: this.id,
        model: response.model,
        usage: { inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens },
      };
    } catch (error) {
      throw mapError(error);
    }
  }
}
