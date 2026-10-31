import { defineConfig, type ReporterDescription } from '@playwright/test';
import { fileURLToPath } from 'node:url';

import base from '../../playwright.config.ts';

const reports = (path: string) => fileURLToPath(new URL(`../../ui/reports/${path}`, import.meta.url));
const reporter: ReporterDescription[] = [
  ['list'],
  ['html', { open: 'never', outputFolder: reports('playwright-html-report') }],
  ['json', { outputFile: reports('results.json') }],
  ['junit', { outputFile: reports('junit.xml') }],
];
if (process.env.CI) reporter.unshift(['github']);

// Explicit real-service sandbox lane. Missing/expired fixtures fail setup;
// these cases never silently skip or borrow a developer's AMR profile.
export default defineConfig({
  ...base,
  testDir: fileURLToPath(new URL('../../ui', import.meta.url)),
  outputDir: reports('funding-results'),
  reporter,
  testMatch: 'workspace-depletion-sandbox.test.ts',
  testIgnore: [],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  use: { ...base.use, trace: 'on', screenshot: 'only-on-failure' },
});
