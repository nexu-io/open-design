import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@excalidraw/excalidraw': resolve(__dirname, 'tests/helpers/excalidraw-mock.tsx'),
      'motion/react': resolve(__dirname, 'tests/helpers/motion-mock.tsx'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup/jsdom-lexical.ts'],
  },
});
