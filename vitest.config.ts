import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws outside React Server Components; tests run on the server anyway.
      "server-only": fileURLToPath(new URL("./apps/web/src/test/serverOnlyStub.ts", import.meta.url)),
      "@/": fileURLToPath(new URL("./apps/web/src/", import.meta.url)),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/web/src/**/*.test.ts"],
    environment: "node",
  },
});
