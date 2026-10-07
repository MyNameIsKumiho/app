import type { z } from "zod";
import { AIError, type TextRequest, type TextResult } from "./types";

/** Anything that can answer a TextRequest: a provider or the router. */
export interface TextGenerator {
  generateText(request: TextRequest): Promise<TextResult>;
}

/** Pulls the first balanced JSON object out of a model reply (handles ```json fences and chatter). */
export function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  // Unbalanced: return the tail so repairJson can try closing it.
  return source.slice(start);
}

/** Cheap, conservative repairs for common LLM JSON mistakes. */
export function repairJson(text: string): string {
  let out = text
    .replace(/[“”]/g, '"')
    .replace(/,\s*([}\]])/g, "$1") // trailing commas
    .replace(/\/\/[^\n"]*$/gm, ""); // line comments outside strings (best effort)
  // Escape raw newlines inside strings.
  let result = "";
  let inString = false;
  let escaped = false;
  for (const ch of out) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      else if (ch === "\n") {
        result += "\\n";
        continue;
      }
    } else if (ch === '"') inString = true;
    result += ch;
  }
  out = result;
  // Close unbalanced brackets (truncated output).
  const stack: string[] = [];
  inString = false;
  escaped = false;
  for (const ch of out) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (inString) out += '"';
  return out + stack.reverse().join("");
}

export type ParseOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseStructured<T>(text: string, schema: z.ZodType<T>): ParseOutcome<T> {
  const raw = extractJson(text);
  if (!raw) return { ok: false, error: "В ответе нет JSON-объекта." };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    try {
      data = JSON.parse(repairJson(raw));
    } catch (e) {
      return { ok: false, error: `Некорректный JSON: ${(e as Error).message}` };
    }
  }
  const parsed = schema.safeParse(data);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  return { ok: false, error: `JSON не соответствует схеме: ${issues.join("; ")}` };
}

export interface StructuredResult<T> {
  value: T;
  result: TextResult;
  attempts: number;
}

/**
 * Requests JSON, validates it with Zod, and on failure retries with the
 * validation error fed back to the model. Never throws raw parse errors.
 */
export async function generateStructured<T>(
  generator: TextGenerator,
  request: TextRequest,
  schema: z.ZodType<T>,
  maxAttempts = 3,
): Promise<StructuredResult<T>> {
  let messages = request.messages;
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await generator.generateText({ ...request, json: true, messages });
    const parsed = parseStructured(result.text, schema);
    if (parsed.ok) return { value: parsed.value, result, attempts: attempt };
    lastError = parsed.error;
    messages = [
      ...request.messages,
      { role: "assistant", content: result.text.slice(0, 6000) },
      { role: "user", content: `Ответ не удалось разобрать: ${parsed.error}\nВерни исправленный ответ: ровно один JSON-объект по заданному формату, без пояснений.` },
    ];
  }
  throw new AIError("invalid_output", `AI вернул некорректные данные после ${maxAttempts} попыток: ${lastError}`);
}
