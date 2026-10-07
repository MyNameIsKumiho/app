import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@aetherfall/core"],
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  // The desktop app ships a self-contained server (`NEXT_OUTPUT=standalone pnpm build`).
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  outputFileTracingRoot: root,
  // Image optimisation is not used; keep the desktop bundle small.
  outputFileTracingExcludes: { "*": ["**/@img/**", "**/sharp/**"] },
};

export default nextConfig;
