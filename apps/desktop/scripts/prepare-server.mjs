// Builds the Next.js app as a self-contained server and copies it into the
// Tauri resources folder. Symlinks (pnpm) are dereferenced so the installer
// contains real files on every OS.
import { execSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const web = path.join(root, "apps/web");
const target = path.resolve(here, "../src-tauri/resources/server");

console.log("> Building the web app (standalone)…");
execSync("pnpm --filter @aetherfall/web build", { cwd: root, stdio: "inherit", env: { ...process.env, NEXT_OUTPUT: "standalone", NEXT_TELEMETRY_DISABLED: "1" } });

const standalone = path.join(web, ".next/standalone");
if (!existsSync(path.join(standalone, "apps/web/server.js"))) throw new Error("Standalone build not found: " + standalone);

console.log("> Copying server into", target);
rmSync(target, { recursive: true, force: true });
cpSync(standalone, target, { recursive: true, dereference: true, filter: (src) => !src.endsWith(".db") && !src.includes(`${path.sep}data${path.sep}`) });
cpSync(path.join(web, ".next/static"), path.join(target, "apps/web/.next/static"), { recursive: true });
if (existsSync(path.join(web, "public"))) cpSync(path.join(web, "public"), path.join(target, "apps/web/public"), { recursive: true });
// sharp (image optimisation) is optional for Next.js and unused here: drop it to save ~110 MB.
const pnpmDir = path.join(target, "node_modules/.pnpm");
if (existsSync(pnpmDir)) {
  for (const entry of readdirSync(pnpmDir)) {
    if (entry.startsWith("sharp@") || entry.startsWith("@img+")) rmSync(path.join(pnpmDir, entry), { recursive: true, force: true });
  }
  for (const dir of ["sharp", "@img"]) {
    rmSync(path.join(pnpmDir, "node_modules", dir), { recursive: true, force: true });
    rmSync(path.join(target, "node_modules", dir), { recursive: true, force: true });
  }
}
// Never ship local secrets.
for (const f of [".env", ".env.local", ".env.production", ".env.production.local"]) rmSync(path.join(target, "apps/web", f), { force: true });
console.log("> Server ready.");
