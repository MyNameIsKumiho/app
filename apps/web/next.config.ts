import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@aetherfall/core"],
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
};

export default nextConfig;
