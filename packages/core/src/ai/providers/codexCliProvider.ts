import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AIError, redactSecrets, type AIProvider, type ProviderStatus, type TextRequest, type TextResult } from "../types";

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
  /** Path to the `codex` binary. */
  bin?: string;
  model?: string;
  timeoutMs?: number;
  enabled?: boolean;
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(bin: string, args: string[], input: string | null, cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
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
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input ?? "");
  });
}

function classify(stderr: string): AIError {
  const text = redactSecrets(stderr.slice(-800));
  if (/usage limit|limit reached|quota/i.test(text)) return new AIError("quota", "Лимит подписки ChatGPT исчерпан", "chatgpt");
  if (/rate.?limit|429/i.test(text)) return new AIError("rate_limit", "ChatGPT: слишком много запросов", "chatgpt");
  if (/not logged in|login|401|unauthori/i.test(text)) return new AIError("auth", "Codex CLI: нужно войти через «Sign in with ChatGPT»", "chatgpt");
  return new AIError("unavailable", `Codex CLI завершился с ошибкой: ${text || "нет вывода"}`, "chatgpt");
}

export class CodexCliProvider implements AIProvider {
  readonly id = "chatgpt";
  readonly label = "ChatGPT (подписка через Codex CLI)";
  readonly kind = "subscription" as const;
  private cachedStatus: { at: number; status: ProviderStatus } | null = null;

  constructor(private readonly options: CodexCliOptions = {}) {}

  private get bin(): string {
    return this.options.bin || "codex";
  }

  async status(): Promise<ProviderStatus> {
    if (this.cachedStatus && Date.now() - this.cachedStatus.at < 60_000) return this.cachedStatus.status;
    const base = { id: this.id, label: this.label, kind: this.kind };
    let status: ProviderStatus;
    if (this.options.enabled === false) {
      status = { ...base, available: false, detail: "Отключено на сервере (CHATGPT_SUBSCRIPTION_ENABLED=false)" };
    } else {
      try {
        const res = await run(this.bin, ["login", "status"], null, tmpdir(), 10_000);
        const out = `${res.stdout}${res.stderr}`.trim();
        if (res.code === 0 && /chatgpt/i.test(out)) status = { ...base, available: true, detail: "Codex CLI: вход через ChatGPT выполнен, тратится лимит подписки" };
        else if (res.code === 0) status = { ...base, available: false, detail: "Codex CLI вошёл по API-ключу, а не через подписку ChatGPT. Выполните `codex login` и выберите «Sign in with ChatGPT»." };
        else status = { ...base, available: false, detail: "Codex CLI установлен, но вход не выполнен. Выполните `codex login` → «Sign in with ChatGPT»." };
      } catch {
        status = { ...base, available: false, detail: "Codex CLI не найден. Установите: npm i -g @openai/codex, затем `codex login`." };
      }
    }
    this.cachedStatus = { at: Date.now(), status };
    return status;
  }

  async generateText(request: TextRequest): Promise<TextResult> {
    const status = await this.status();
    if (!status.available) throw new AIError("not_configured", status.detail, this.id);
    const dir = await mkdtemp(path.join(tmpdir(), "aetherfall-codex-"));
    const outFile = path.join(dir, "answer.txt");
    const prompt = [
      "Ты используешься как языковая модель внутри приложения. Не запускай команды, не читай и не изменяй файлы — просто ответь текстом.",
      "## Системные инструкции",
      request.system,
      ...request.messages.map((m) => `## ${m.role === "user" ? "Запрос" : "Твой предыдущий ответ"}\n${m.content}`),
      request.json ? "Ответь только JSON-объектом." : "",
    ].join("\n\n");
    const args = ["exec", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "--color", "never", "--ignore-rules", "-o", outFile];
    if (this.options.model) args.push("-m", this.options.model);
    args.push("-");
    try {
      const res = await run(this.bin, args, prompt, dir, this.options.timeoutMs ?? 240_000, request.signal);
      if (res.code !== 0) throw classify(res.stderr || res.stdout);
      const text = (await readFile(outFile, "utf8").catch(() => res.stdout)).trim();
      if (!text) throw new AIError("invalid_output", "Codex CLI вернул пустой ответ", this.id);
      return { text, providerId: this.id, model: this.options.model ?? "codex-default" };
    } catch (error) {
      if (error instanceof AIError) throw error;
      throw new AIError("unavailable", `Не удалось запустить Codex CLI: ${redactSecrets((error as Error).message)}`, this.id);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
