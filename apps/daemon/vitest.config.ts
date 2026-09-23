import { defineConfig } from 'vitest/config';

import { DaemonTestSequencer } from './vitest.sequencer.js';

export default defineConfig({
  test: {
    environment: 'node',
    // These suites mutate process-wide env/PATH and bind real local servers.
    // Keep files serial so fake agent binaries stay scoped to their tests.
    fileParallelism: false,
    include: ['tests/**/*.test.{ts,tsx,js,mjs,cjs}'],
    sequence: {
      sequencer: DaemonTestSequencer,
    },
    setupFiles: ['tests/setup.ts'],
    testTimeout: 20_000,
  },
});
