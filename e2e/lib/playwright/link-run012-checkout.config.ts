import { defineConfig } from '@playwright/test';
import base from './funding.config.ts';

// Explicit, single-owner checkout sandbox. Never part of the normal UI pool.
export default defineConfig({
  ...base,
  testMatch: 'link-run012-checkout-sandbox.test.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
});
