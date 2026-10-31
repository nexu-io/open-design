import { defineConfig } from '@playwright/test';
import base from './funding.config.ts';
export default defineConfig({ ...base, testMatch: process.env.OD_MANUAL_RETRY_RUNNER === 'active'
  ? 'workspace-manual-retry-sandbox.test.ts' : 'workspace-free-concurrency-sandbox.test.ts' });
