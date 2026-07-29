import { defineConfig, devices } from '@playwright/test';

function parseWorkerCount(value: string | undefined): number {
  if (value == null || value.length === 0) return 2;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`OD_PLAYWRIGHT_WORKERS must be a positive integer, got: ${value}`);
  }
  return parsed;
}

export default defineConfig({
  testDir: './ui',
  // This is the functional config. Strict-visual specs (`visual-*.test.ts`)
  // are owned by `playwright.visual.config.ts` (its own `testMatch`,
  // snapshot/output settings, and the `playwright_visual` CI lane), so they
  // must never be picked up here — otherwise a bare `pnpm test:ui` or the
  // generic full-pool shard run would execute them without their visual
  // config. Excluding them at the config level keeps every functional
  // consumer (full pool, `test:ui*`, ui_p0 groups) aligned.
  testIgnore: 'visual-*.test.ts',
  outputDir: './ui/reports/test-results',
  timeout: Number(process.env.OD_PLAYWRIGHT_TIMEOUT) || 45_000,
  retries: process.env.CI ? 1 : 0,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: process.env.OD_PLAYWRIGHT_FULLY_PARALLEL === '1',
  workers: parseWorkerCount(process.env.OD_PLAYWRIGHT_WORKERS),
  reporter: process.env.CI
    ? [
        ['github'],
        ['list'],
        ['html', { open: 'never', outputFolder: './ui/reports/playwright-html-report' }],
        ['json', { outputFile: './ui/reports/results.json' }],
        ['junit', { outputFile: './ui/reports/junit.xml' }],
      ]
    : [
        ['list'],
        ['html', { open: 'never', outputFolder: './ui/reports/playwright-html-report' }],
        ['json', { outputFile: './ui/reports/results.json' }],
        ['junit', { outputFile: './ui/reports/junit.xml' }],
      ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
