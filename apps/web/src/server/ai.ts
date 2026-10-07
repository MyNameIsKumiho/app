import "server-only";
import {
  AIRouter,
  ClaudeProvider,
  CodexCliProvider,
  MockImageProvider,
  MockProvider,
  OpenAIImageProvider,
  OpenAIProvider,
  type AIProvider,
  type ImageProvider,
  type ProviderStatus,
  type RouterEvent,
} from "@aetherfall/core/server";
import type { AppSettings } from "./settings";

/**
 * Builds providers from the server environment. Keys are read here and only
 * here; they are handed to the vendor SDK clients and never serialized.
 */
export interface AIEnvironment {
  providers: Map<string, AIProvider>;
  images: { openai: ImageProvider; mock: ImageProvider };
  events: RouterEvent[];
}

/** Order used when the primary provider is "auto": real models first, the mock last. */
export const AUTO_ORDER = ["claude", "chatgpt", "openai", "mock"];

function createEnvironment(env: NodeJS.ProcessEnv): AIEnvironment {
  const providers = new Map<string, AIProvider>();
  providers.set("claude", new ClaudeProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL }));
  providers.set(
    "chatgpt",
    new CodexCliProvider({ enabled: env.CHATGPT_SUBSCRIPTION_ENABLED !== "false", bin: env.CODEX_BIN, model: env.CODEX_MODEL || undefined }),
  );
  providers.set("openai", new OpenAIProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL }));
  providers.set("mock", new MockProvider());
  return {
    providers,
    images: { openai: new OpenAIImageProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_IMAGE_MODEL }), mock: new MockImageProvider() },
    events: [],
  };
}

const globalForAI = globalThis as unknown as { __aetherfallAI?: AIEnvironment };

export function getAIEnvironment(): AIEnvironment {
  globalForAI.__aetherfallAI ??= createEnvironment(process.env);
  return globalForAI.__aetherfallAI;
}

export function createRouter(env: AIEnvironment, settings: AppSettings): AIRouter {
  return new AIRouter(env.providers, { primary: settings.ai.primary, fallback: settings.ai.fallback, autoOrder: AUTO_ORDER }, (event) => {
    env.events.push(event);
    if (env.events.length > 50) env.events.shift();
  });
}

export function pickImageProvider(env: AIEnvironment, settings: AppSettings): ImageProvider {
  if (settings.images.provider === "mock") return env.images.mock;
  if (settings.images.provider === "openai") return env.images.openai;
  return env.images.openai.available() ? env.images.openai : env.images.mock;
}

export interface AIStatus {
  providers: ProviderStatus[];
  /** Provider that will actually answer the next call. */
  active: { id: string; label: string; kind: string } | null;
  fallback: { id: string; label: string } | null;
  usingMock: boolean;
  image: { id: string; label: string; mock: boolean };
  recentEvents: RouterEvent[];
  /** Desktop build: the local file where the user puts API keys (path only). */
  desktopConfigFile: string | null;
}

export async function describeAI(env: AIEnvironment, settings: AppSettings): Promise<AIStatus> {
  const router = createRouter(env, settings);
  const [providers, plan] = await Promise.all([router.statuses(), router.plan()]);
  const first = plan[0];
  const second = plan[1];
  const image = pickImageProvider(env, settings);
  return {
    providers,
    active: first ? { id: first.id, label: first.label, kind: first.kind } : null,
    fallback: second ? { id: second.id, label: second.label } : null,
    usingMock: first?.kind === "mock",
    image: { id: image.id, label: image.label, mock: image.id === env.images.mock.id },
    recentEvents: env.events.slice(-10).reverse(),
    desktopConfigFile: process.env.AETHERFALL_CONFIG_FILE ?? null,
  };
}
