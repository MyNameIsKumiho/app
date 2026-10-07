import { AIError, FALLBACK_ERROR_CODES, redactSecrets, type AIProvider, type ProviderStatus, type TextRequest, type TextResult } from "./types";

export type StoryProviderChoice = string | "auto";
export type FallbackChoice = string | "disabled";

export interface RouterSettings {
  /** Provider id for story/creator calls, or "auto" (first available in `autoOrder`). */
  primary: StoryProviderChoice;
  /** Provider used when the primary fails with a recoverable error. */
  fallback: FallbackChoice;
  /** Order used by "auto". The mock is only used when nothing else is available. */
  autoOrder: string[];
}

export interface RouterEvent {
  providerId: string;
  ok: boolean;
  error?: string;
  code?: string;
  ms: number;
}

/**
 * AI Router: picks the provider for each call and falls back on rate limits,
 * exhausted quota, outages or auth problems. Callers never name a vendor.
 */
export class AIRouter {
  readonly events: RouterEvent[] = [];

  constructor(
    private readonly providers: Map<string, AIProvider>,
    private settings: RouterSettings,
    private readonly onEvent?: (event: RouterEvent) => void,
  ) {}

  updateSettings(settings: RouterSettings): void {
    this.settings = settings;
  }

  async statuses(): Promise<ProviderStatus[]> {
    return Promise.all([...this.providers.values()].map((p) => p.status()));
  }

  /** Ordered list of providers to try for one call. */
  async plan(): Promise<AIProvider[]> {
    const statuses = new Map((await this.statuses()).map((s) => [s.id, s]));
    const available = (id: string) => statuses.get(id)?.available === true;
    const chain: string[] = [];
    if (this.settings.primary === "auto") {
      const firstReal = this.settings.autoOrder.find((id) => available(id) && this.providers.get(id)?.kind !== "mock");
      chain.push(firstReal ?? this.settings.autoOrder.find(available) ?? "mock");
    } else {
      chain.push(this.settings.primary);
    }
    if (this.settings.fallback !== "disabled" && !chain.includes(this.settings.fallback)) chain.push(this.settings.fallback);
    return chain.map((id) => this.providers.get(id)).filter((p): p is AIProvider => p !== undefined);
  }

  async generateText(request: TextRequest): Promise<TextResult> {
    const chain = await this.plan();
    if (chain.length === 0) throw new AIError("not_configured", "Нет ни одного настроенного AI-провайдера.");
    let lastError: AIError | undefined;
    for (const provider of chain) {
      const started = Date.now();
      try {
        const result = await provider.generateText(request);
        this.record({ providerId: provider.id, ok: true, ms: Date.now() - started });
        return result;
      } catch (error) {
        const aiError = error instanceof AIError ? error : new AIError("unknown", error instanceof Error ? error.message : String(error), provider.id);
        this.record({ providerId: provider.id, ok: false, code: aiError.code, error: redactSecrets(aiError.message), ms: Date.now() - started });
        lastError = aiError;
        if (request.signal?.aborted || !FALLBACK_ERROR_CODES.has(aiError.code)) throw aiError;
      }
    }
    throw lastError ?? new AIError("unknown", "AI недоступен");
  }

  private record(event: RouterEvent): void {
    this.events.push(event);
    if (this.events.length > 100) this.events.shift();
    this.onEvent?.(event);
  }
}
