// Downloads the official Node.js runtime for this machine and places it where
// Tauri expects a sidecar binary: src-tauri/binaries/node-<target-triple>[.exe].
// The version matches the Node that built the server, so native modules agree.
import { execSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const binDir = path.resolve(here, "../src-tauri/binaries");
const version = process.version;
const triple = /host: (\S+)/.exec(execSync("rustc -vV").toString())?.[1];
if (!triple) throw new Error("Rust is not installed: rustc -vV failed");
const isWin = process.platform === "win32";
const out = path.join(binDir, `node-${triple}${isWin ? ".exe" : ""}`);

if (existsSync(out)) {
  console.log(`> Node runtime already present: ${path.basename(out)}`);
  process.exit(0);
}
mkdirSync(binDir, { recursive: true });
const arch = { x64: "x64", arm64: "arm64" }[process.arch];
if (!arch) throw new Error(`Unsupported CPU: ${process.arch}`);
const platform = { win32: "win", darwin: "darwin", linux: "linux" }[process.platform];
if (!platform) throw new Error(`Unsupported OS: ${process.platform}`);

const tmp = mkdtempSync(path.join(tmpdir(), "aetherfall-node-"));
try {
  if (isWin) {
    const url = `https://nodejs.org/dist/${version}/win-${arch}/node.exe`;
    console.log(`> Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  } else {
    const name = `node-${version}-${platform}-${arch}`;
    const url = `https://nodejs.org/dist/${version}/${name}.tar.gz`;
    console.log(`> Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const archive = path.join(tmp, "node.tar.gz");
    writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
    execSync(`tar -xzf "${archive}" -C "${tmp}" "${name}/bin/node"`);
    copyFileSync(path.join(tmp, name, "bin/node"), out);
    chmodSync(out, 0o755);
  }
  console.log(`> Node ${version} → ${path.basename(out)}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
