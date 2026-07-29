import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./lib', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['specs/**/*.spec.ts', 'tests/**/*.test.ts'],
  },
});
