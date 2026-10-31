import { defineConfig } from '@playwright/test';
import base from './funding.config.ts';

// Explicit, single-owner real-service lane. It is excluded from the normal
// UI pool because it requires a private AMR fixture and an external writer.
export default defineConfig({
  ...base,
  testMatch: 'link-closure-sandbox.test.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
});
