import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const configuredMaxWorkers = Number.parseInt(process.env.OD_E2E_VITEST_MAX_WORKERS ?? '4', 10);
const maxWorkers = Number.isFinite(configuredMaxWorkers) && configuredMaxWorkers > 0
  ? configuredMaxWorkers
  : 4;

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./lib', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    fileParallelism: true,
    include: ['specs/**/*.spec.ts', 'tests/**/*.test.ts'],
    maxWorkers,
    pool: 'forks',
  },
});
