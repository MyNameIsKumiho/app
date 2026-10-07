import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AIError, CharacterValidationError, ScenarioImportError, redactSecrets } from "@aetherfall/core/server";

/** Error with an HTTP status and a message that is safe to show to the user. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface ErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}

const AI_STATUS: Record<string, number> = { not_configured: 503, auth: 502, rate_limit: 429, quota: 402, unavailable: 503, timeout: 504, invalid_request: 400, invalid_output: 502, refused: 422, unknown: 502 };

export function toErrorResponse(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
  if (error instanceof ZodError) {
    const details = error.issues.map((i) => `${i.path.join(".") || "запрос"}: ${i.message}`);
    return NextResponse.json({ error: "Некорректные данные", details }, { status: 400 });
  }
  if (error instanceof CharacterValidationError) return NextResponse.json({ error: "Персонаж заполнен не полностью", details: error.issues }, { status: 400 });
  if (error instanceof ScenarioImportError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof AIError) {
    return NextResponse.json({ error: redactSecrets(error.message), code: error.code }, { status: AI_STATUS[error.code] ?? 502 });
  }
  // Unexpected: log a redacted message on the server, return a generic one.
  console.error("[api]", redactSecrets(error instanceof Error ? (error.stack ?? error.message) : String(error)));
  return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
}

type Handler<C> = (request: Request, context: C) => Promise<unknown>;

/** Wraps a route handler: JSON response on success, mapped error on failure. */
export function route<C = unknown>(handler: Handler<C>) {
  return async (request: Request, context: C): Promise<Response> => {
    try {
      const result = await handler(request, context);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Тело запроса должно быть JSON");
  }
}

export type IdParams = { params: Promise<{ id: string }> };
