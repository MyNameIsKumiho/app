import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { locateCodex } from "./codexLocator";
import { AIError, redactSecrets, type AIProvider, type AISpeed, type ProviderStatus, type TextRequest, type TextResult } from "../types";

/**
 * "ChatGPT subscription" provider.
 *
 * Runs the official OpenAI Codex CLI that the user installed and signed into
 * themselves with "Sign in with ChatGPT". Requests then draw on the user's
 * ChatGPT plan instead of API credits. The app never sees, stores or copies
 * the user's ChatGPT credentials: authentication stays inside the CLI.
 *
 * Works only where the backend runs on the user's own machine (desktop/local).
 */
export interface CodexCliOptions {
  /** Path to the `codex` binary. When unset the CLI is looked up on this machine. */
  bin?: string;
  model?: string;
  timeoutMs?: number;
  enabled?: boolean;
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Reasoning effort per speed tier; the model stays the one Codex is set to unless the player names one. */
export const CODEX_SPEED_EFFORT: Record<AISpeed, "low" | "medium" | "high"> = { fast: "low", balanced: "medium", smart: "high" };

/** One draft step is a few thousand tokens of JSON; give it room, but do not hang forever. */
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

function run(bin: string, args: string[], input: string | null, cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    const onAbort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({ code, stdout, stderr, timedOut });
    });
    child.stdin.end(input ?? "");
  });
}

/**
 * Codex echoes the whole prompt into its log, so the raw output is useless as
 * an error message. Keep only lines that look like an actual problem.
 */
function errorLines(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /error|failed|denied|limit|quota|unauthori|login|429|401|403|5\d\d\b/i.test(l) && l.length < 400);
  return lines.slice(-3).join(" · ");
}

function classify(output: string): AIError {
  const text = redactSecrets(errorLines(output));
  if (/usage limit|limit reached|quota/i.test(text)) return new AIError("quota", "Лимит подписки ChatGPT исчерпан", "chatgpt");
  if (/rate.?limit|429/i.test(text)) return new AIError("rate_limit", "ChatGPT: слишком много запросов", "chatgpt");
  if (/not logged in|login|401|unauthori/i.test(text)) return new AIError("auth", "Codex CLI: нужно войти через «Sign in with ChatGPT»", "chatgpt");
  return new AIError("unavailable", `Codex CLI завершился с ошибкой${text ? `: ${text}` : " без описания причины"}`, "chatgpt");
}

export class CodexCliProvider implements AIProvider {
  readonly id = "chatgpt";
  readonly label = "ChatGPT (подписка через Codex CLI)";
  readonly kind = "subscription" as const;
  private cachedStatus: { at: number; status: ProviderStatus } | null = null;
  private resolvedBin: string | null = null;

  constructor(private readonly options: CodexCliOptions = {}) {}

  /** The Codex CLI to run, found once and reused while it keeps working. */
  private async bin(): Promise<string | null> {
    if (!this.resolvedBin) this.resolvedBin = await locateCodex(this.options.bin || undefined);
    return this.resolvedBin;
  }

  async status(): Promise<ProviderStatus> {
    if (this.cachedStatus && Date.now() - this.cachedStatus.at < 60_000) return this.cachedStatus.status;
    const base = { id: this.id, label: this.label, kind: this.kind };
    let status: ProviderStatus;
    if (this.options.enabled === false) {
      status = { ...base, available: false, detail: "Отключено на сервере (CHATGPT_SUBSCRIPTION_ENABLED=false)" };
    } else {
      try {
        const bin = await this.bin();
        if (!bin) throw new Error("not found");
        const res = await run(bin, ["login", "status"], null, tmpdir(), 10_000);
        const out = `${res.stdout}${res.stderr}`.trim();
        if (res.code === 0 && /chatgpt/i.test(out)) status = { ...base, available: true, detail: `Codex CLI: вход через ChatGPT выполнен, тратится лимит подписки (${bin})` };
        else if (res.code === 0) status = { ...base, available: false, detail: "Codex CLI вошёл по API-ключу, а не через подписку ChatGPT. Выполните `codex login` и выберите «Sign in with ChatGPT»." };
        else status = { ...base, available: false, detail: "Codex CLI установлен, но вход не выполнен. Выполните `codex login` → «Sign in with ChatGPT»." };
      } catch {
        this.resolvedBin = null;
        status = { ...base, available: false, detail: "Codex CLI не найден: ни приложение Codex, ни npm-пакет @openai/codex не дают командную строку. Установите: npm i -g @openai/codex (вход через ChatGPT подхватится)." };
      }
    }
    this.cachedStatus = { at: Date.now(), status };
    return status;
  }

  async generateText(request: TextRequest): Promise<TextResult> {
    const status = await this.status();
    const bin = await this.bin();
    if (!status.available || !bin) throw new AIError("not_configured", status.detail, this.id);
    const dir = await mkdtemp(path.join(tmpdir(), "aetherfall-codex-"));
    const outFile = path.join(dir, "answer.txt");
    const prompt = [
      "Ты используешься как языковая модель внутри приложения. Не запускай команды, не читай и не изменяй файлы — просто ответь текстом.",
      "## Системные инструкции",
      request.system,
      ...request.messages.map((m) => `## ${m.role === "user" ? "Запрос" : "Твой предыдущий ответ"}\n${m.content}`),
      request.json ? "Ответь только JSON-объектом." : "",
    ].join("\n\n");
    // The user's own MCP servers are not needed to write text, and each one would start a process per request.
    const args = ["exec", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "--color", "never", "--ignore-rules", "-c", "mcp_servers={}", "-o", outFile];
    const model = request.model || this.options.model;
    if (model) args.push("-m", model);
    if (request.speed) args.push("-c", `model_reasoning_effort="${CODEX_SPEED_EFFORT[request.speed]}"`);
    args.push("-");
    try {
      const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const res = await run(bin, args, prompt, dir, timeoutMs, request.signal);
      if (res.timedOut) throw new AIError("timeout", `ChatGPT (Codex) не ответил за ${Math.round(timeoutMs / 60_000)} мин`, this.id);
      if (res.code !== 0) throw classify(`${res.stderr}\n${res.stdout}`);
      const text = (await readFile(outFile, "utf8").catch(() => res.stdout)).trim();
      if (!text) throw new AIError("invalid_output", "Codex CLI вернул пустой ответ", this.id);
      return { text, providerId: this.id, model: `${model ?? "codex-default"}${request.speed ? ` · ${CODEX_SPEED_EFFORT[request.speed]}` : ""}` };
    } catch (error) {
      if (error instanceof AIError) throw error;
      throw new AIError("unavailable", `Не удалось запустить Codex CLI: ${redactSecrets((error as Error).message)}`, this.id);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
