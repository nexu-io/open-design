import { defineConfig } from '@playwright/test';
import base from './funding.config.ts';
export default defineConfig({...base, testMatch: process.env.API001_READBACK_ONLY === '1' ? 'workspace-api-wallet-readback-sandbox.test.ts' : process.env.API001_ONLY === '1' ? 'workspace-api-wallet-sandbox.test.ts' : process.env.F04_RETRY_ONLY === '1' ? 'workspace-concurrency-retry-sandbox.test.ts' : 'workspace-concurrency-sandbox.test.ts'});
