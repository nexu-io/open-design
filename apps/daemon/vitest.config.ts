import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // These suites mutate process-wide env/PATH and bind real local servers.
    // Keep files serial so fake agent binaries stay scoped to their tests.
    fileParallelism: false,
    include: ['tests/**/*.test.{ts,tsx,js,mjs,cjs}'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 20_000,
    // 129 test files start a real daemon server in beforeEach/afterEach; a
    // cold start (plugin seeding + migrations) exceeds the 10s default hook
    // timeout on shared or loaded hosts, producing flake clusters.
    hookTimeout: 60_000,
  },
});
