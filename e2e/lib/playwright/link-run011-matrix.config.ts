import { defineConfig } from '@playwright/test';
import base from './funding.config.ts';

export default defineConfig({
  ...base,
  testMatch: 'link-run011-matrix-sandbox.test.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
});
