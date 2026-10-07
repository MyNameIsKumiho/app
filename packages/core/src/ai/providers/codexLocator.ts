import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Finds a working Codex CLI on the user's machine: one installed with npm,
 * the CLI shipped inside the Codex desktop app (including the Microsoft Store
 * build), or a path the user set by hand. Each candidate is checked with
 * `--version` before it is used.
 */

const MAX_SCAN_DEPTH = 8;

/** Files that mark an Electron/Chromium app folder: its main exe is the GUI, not the CLI. */
const GUI_MARKERS = ["resources.pak", "chrome_100_percent.pak", "v8_context_snapshot.bin", "icudtl.dat"];

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function listDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Recursively finds files named `name` below `root`, skipping the app's own root executable. */
function scan(root: string, name: string, depth = 0, out: string[] = [], intoNodeModules = false): string[] {
  if (depth > MAX_SCAN_DEPTH) return out;
  for (const entry of listDir(root)) {
    const full = path.join(root, entry);
    if (entry.toLowerCase() === name && depth > 0 && isFile(full)) {
      if (!GUI_MARKERS.some((m) => existsSync(path.join(root, m)))) out.push(full);
    }
    else if (!entry.startsWith(".") && entry !== "locales" && (intoNodeModules || entry !== "node_modules")) {
      try {
        if (statSync(full).isDirectory()) scan(full, name, depth + 1, out, intoNodeModules);
      } catch {
        /* unreadable folder: skip */
      }
    }
  }
  return out;
}

/**
 * Native binaries of the npm package `@openai/codex`: under its vendor/ folder
 * or in its per-platform optional package (e.g. @openai/codex-win32-x64).
 */
function npmVendorBinaries(nodeModules: string, exe: string): string[] {
  return scan(path.join(nodeModules, "@openai"), exe, 0, [], true);
}

function windowsStorePackageDirs(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "Get-AppxPackage | Where-Object { $_.Name -match 'codex' } | ForEach-Object { $_.InstallLocation }"],
      { timeout: 8_000, windowsHide: true },
      (error, stdout) => resolve(error ? [] : stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)),
    );
  });
}

export async function codexCandidates(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): Promise<string[]> {
  const win = platform === "win32";
  const exe = win ? "codex.exe" : "codex";
  const home = env.USERPROFILE || env.HOME || homedir();
  const list: string[] = [];
  const add = (...paths: string[]) => list.push(...paths);

  for (const dir of (env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean)) {
    add(path.join(dir, exe));
    // npm's shim folder: prefer the native binary behind the codex.cmd / codex script.
    add(...npmVendorBinaries(path.join(dir, "node_modules"), exe));
  }

  if (win) {
    const appData = env.APPDATA ?? path.join(home, "AppData", "Roaming");
    const localAppData = env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    add(...npmVendorBinaries(path.join(appData, "npm", "node_modules"), exe));
    // Microsoft Store Codex app: the CLI ships at <InstallLocation>\app\resources\codex.exe.
    for (const dir of await windowsStorePackageDirs()) add(...scan(dir, exe));
    for (const base of [path.join(localAppData, "Programs"), localAppData, env.ProgramFiles ?? "C:\\Program Files"]) {
      for (const entry of listDir(base)) if (/codex|openai/i.test(entry)) add(...scan(path.join(base, entry), exe));
    }
    // App Execution Alias of a Store app: last, since it may point at the app window rather than a CLI.
    add(path.join(localAppData, "Microsoft", "WindowsApps", exe));
  } else {
    for (const dir of [".npm-global/bin", ".local/bin", ".volta/bin", ".bun/bin"]) add(path.join(home, dir, exe));
    for (const dir of ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]) add(path.join(dir, exe));
    add("/Applications/Codex.app/Contents/Resources/codex", path.join(home, "Applications/Codex.app/Contents/Resources/codex"));
  }

  const seen = new Set<string>();
  return list.filter((p) => {
    const key = win ? p.toLowerCase() : p;
    if (seen.has(key) || !existsSync(p)) return false;
    seen.add(key);
    return true;
  });
}

function answersVersion(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 8_000, windowsHide: true }, (error, stdout, stderr) => {
      resolve(!error && /codex/i.test(`${stdout}${stderr}`));
    });
  });
}

/** Returns the first Codex CLI that answers `--version`, or null. `preferred` (CODEX_BIN) is tried first. */
export async function locateCodex(preferred?: string): Promise<string | null> {
  const candidates = await codexCandidates();
  const ordered = preferred ? [preferred, ...candidates] : candidates;
  for (const bin of ordered) {
    if (await answersVersion(bin)) return bin;
  }
  return null;
}
