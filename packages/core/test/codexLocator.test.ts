import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { codexCandidates, locateCodex } from "../src/ai/providers/codexLocator";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fakeCli(file: string, output: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `#!/bin/sh\necho "${output}"\n`);
  chmodSync(file, 0o755);
}

describe.skipIf(process.platform === "win32")("codex locator", () => {
  it("finds the native binary behind an npm global install", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "codex-loc-"));
    dirs.push(root);
    const bin = path.join(root, "bin");
    const native = path.join(bin, "node_modules/@openai/codex/vendor/x86_64-unknown-linux-musl/codex/codex");
    fakeCli(native, "codex-cli 1.2.3");
    const found = await codexCandidates({ PATH: bin, HOME: root }, "linux");
    expect(found).toContain(native);
  });

  it("skips programs that do not answer as the Codex CLI", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "codex-loc-"));
    dirs.push(root);
    const impostor = path.join(root, "codex");
    fakeCli(impostor, "something else");
    expect(await locateCodex(impostor)).not.toBe(impostor);
    const real = path.join(root, "real", "codex");
    fakeCli(real, "codex-cli 1.2.3");
    expect(await locateCodex(real)).toBe(real);
  });
});

describe.skipIf(process.platform === "win32")("codex locator layouts", () => {
  it("finds the binary in a per-platform npm package and skips GUI executables", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "codex-loc-"));
    dirs.push(root);
    const bin = path.join(root, "bin");
    const native = path.join(bin, "node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/codex/codex");
    fakeCli(native, "codex-cli 1.2.3");
    const gui = path.join(bin, "node_modules/@openai/desktop/codex");
    fakeCli(gui, "gui");
    writeFileSync(path.join(path.dirname(gui), "resources.pak"), "");
    const found = await codexCandidates({ PATH: bin, HOME: root }, "linux");
    expect(found).toContain(native);
    expect(found).not.toContain(gui);
  });
});
