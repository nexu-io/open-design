import { defineConfig } from '@playwright/test';
import base from './funding.config.ts';

// Explicit real AMR/Link sandbox only; the ordinary UI pool must never run it.
export default defineConfig({
  ...base,
  testMatch: 'link-mem009-sandbox.test.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
});
