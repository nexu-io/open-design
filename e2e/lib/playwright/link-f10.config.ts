import { defineConfig } from '@playwright/test';
import base from './funding.config.ts';
if (!process.env.OD_F10_FIXTURE_DIR) throw new Error('Dedicated F10 lane requires an explicit owned OD_F10_FIXTURE_DIR; the generic UI pool remains opt-in.');
export default defineConfig({ ...base, testMatch: 'amr-funding-real.test.ts', grep: /F10 real funding recovery/, workers: 1, fullyParallel: false, retries: 0, use: { ...base.use, video: 'on', viewport: { width: 1280, height: 720 } } });
