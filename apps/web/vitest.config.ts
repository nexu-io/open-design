import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'motion/react': resolve(__dirname, 'tests/helpers/motion-mock.tsx'),
      '@open-design/sidecar': resolve(__dirname, '../../packages/sidecar/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup/jsdom-lexical.ts'],
  },
});
