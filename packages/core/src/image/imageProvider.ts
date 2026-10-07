import OpenAI from "openai";
import type { VisualProfile } from "../domain/scenario";
import { AIError, redactSecrets } from "../ai/types";
import { hash } from "../ai/providers/mock/util";

import type { ImageKind } from "./types";

export { shouldIllustrate, type ImageKind, type IllustrationMode } from "./types";

export interface ImageRequest {
  kind: ImageKind;
  prompt: string;
  /** Short caption for placeholders. */
  title: string;
}

export interface GeneratedImage {
  dataUri: string;
  providerId: string;
  prompt: string;
}

export interface ImageProvider {
  readonly id: string;
  readonly label: string;
  available(): boolean;
  generate(request: ImageRequest): Promise<GeneratedImage>;
}

const SIZES: Record<ImageKind, "1024x1024" | "1536x1024" | "1024x1536"> = {
  scene: "1536x1024",
  location: "1536x1024",
  portrait: "1024x1536",
  cover: "1024x1536",
  item: "1024x1024",
};

/** Image generation via OpenAI (server-side key only). */
export class OpenAIImageProvider implements ImageProvider {
  readonly id = "openai-image";
  readonly label = "OpenAI Images";
  private readonly client: OpenAI | null;

  constructor(private readonly options: { apiKey?: string; model?: string }) {
    this.client = options.apiKey ? new OpenAI({ apiKey: options.apiKey, timeout: 180_000, maxRetries: 1 }) : null;
  }

  available(): boolean {
    return this.client !== null;
  }

  async generate(request: ImageRequest): Promise<GeneratedImage> {
    if (!this.client) throw new AIError("not_configured", "Не задан OPENAI_API_KEY для изображений", this.id);
    try {
      const res = await this.client.images.generate({ model: this.options.model || "gpt-image-1", prompt: request.prompt, size: SIZES[request.kind], n: 1 });
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new AIError("invalid_output", "Сервис изображений не вернул картинку", this.id);
      return { dataUri: `data:image/png;base64,${b64}`, providerId: this.id, prompt: request.prompt };
    } catch (error) {
      if (error instanceof AIError) throw error;
      throw new AIError("unavailable", `Ошибка генерации изображения: ${redactSecrets((error as Error).message)}`, this.id);
    }
  }
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
}

/** Deterministic SVG artwork placeholder: lets the image pipeline run without any API. */
export class MockImageProvider implements ImageProvider {
  readonly id = "mock-image";
  readonly label = "Плейсхолдеры (без AI)";

  available(): boolean {
    return true;
  }

  async generate(request: ImageRequest): Promise<GeneratedImage> {
    const h = hash(request.prompt);
    const hueA = h % 360;
    const hueB = (hueA + 40 + (h % 80)) % 360;
    const [w, hgt] = SIZES[request.kind].split("x").map(Number) as [number, number];
    const stars = Array.from({ length: 40 }, (_, i) => {
      const x = (hash(`${h}:${i}:x`) % w).toString();
      const y = (hash(`${h}:${i}:y`) % hgt).toString();
      const r = ((hash(`${h}:${i}:r`) % 20) / 10 + 0.5).toFixed(1);
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="0.6"/>`;
    }).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hueA},55%,22%)"/><stop offset="1" stop-color="hsl(${hueB},60%,10%)"/></linearGradient><radialGradient id="glow" cx="0.5" cy="0.6" r="0.5"><stop offset="0" stop-color="hsl(${hueB},90%,70%)" stop-opacity="0.45"/><stop offset="1" stop-color="hsl(${hueB},90%,70%)" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#glow)"/>${stars}<text x="50%" y="88%" text-anchor="middle" font-family="Georgia, serif" font-size="${Math.round(w / 28)}" fill="white" opacity="0.85">${escapeXml(request.title.slice(0, 60))}</text></svg>`;
    return { dataUri: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, providerId: this.id, prompt: request.prompt };
  }
}

export function describeVisualProfile(profile: Partial<VisualProfile> | undefined): string {
  if (!profile) return "";
  const parts = [
    profile.hair && `hair: ${profile.hair}`,
    profile.eyes && `eyes: ${profile.eyes}`,
    profile.face && `face: ${profile.face}`,
    profile.body && `body: ${profile.body}`,
    profile.height && `height: ${profile.height}`,
    profile.clothing && `clothing: ${profile.clothing}`,
    profile.accessories && `accessories: ${profile.accessories}`,
    profile.distinctiveFeatures && `distinctive: ${profile.distinctiveFeatures}`,
  ].filter(Boolean);
  return parts.join("; ");
}

const STYLE = "anime light-novel illustration, painterly, cinematic lighting, detailed background, no text, no watermark";

/** Builds a consistent image prompt from the scene and the visual profiles of the characters in it. */
export function buildImagePrompt(input: { kind: ImageKind; subject: string; setting?: string; characters?: { name: string; profile?: Partial<VisualProfile>; appearance?: string }[] }): string {
  const characters = (input.characters ?? [])
    .map((c) => `${c.name} (${[describeVisualProfile(c.profile), c.appearance].filter(Boolean).join("; ") || "no fixed look"})`)
    .join("; ");
  return [`${input.kind === "cover" ? "Book cover art" : input.kind === "portrait" ? "Character portrait" : input.kind === "item" ? "Item concept art" : "Scene illustration"}: ${input.subject}`, input.setting && `Setting: ${input.setting}`, characters && `Characters: ${characters}`, `Style: ${STYLE}`]
    .filter(Boolean)
    .join(". ");
}
