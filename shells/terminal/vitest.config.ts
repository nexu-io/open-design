import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    maxWorkers: 1,
    pool: "forks",
    testTimeout: 120_000,
  },
});
