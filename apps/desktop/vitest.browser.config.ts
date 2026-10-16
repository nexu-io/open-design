import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['tests/**/*.browser.test.ts'],
    testTimeout: 30_000,
  },
});
