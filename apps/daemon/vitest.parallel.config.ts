import { defineConfig } from 'vitest/config';

const configuredMaxWorkers = Number.parseInt(process.env.OD_CI_DAEMON_MAX_WORKERS ?? '4', 10);
const maxWorkers = Number.isFinite(configuredMaxWorkers) && configuredMaxWorkers > 0
  ? configuredMaxWorkers
  : 4;

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: true,
    include: ['tests/**/*.test.{ts,tsx,js,mjs,cjs}'],
    maxWorkers,
    pool: 'forks',
    setupFiles: ['tests/setup.ts'],
    testTimeout: 20_000,
  },
});
