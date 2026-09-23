import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // These suites shell out to real packaging tools — 7z archive/extract,
    // pnpm pack, installer assembly — against temp directories. Vitest's 5s
    // default is close enough to their real cost that runner speed alone
    // decides pass/fail: the Windows launcher payload archive test failed CI
    // at 5007ms while passing locally and on faster runners.
    testTimeout: 20_000,
  },
});
