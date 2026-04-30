import { defineConfig, devices } from '@playwright/test';
import { resolveDevPorts } from '../scripts/resolve-dev-ports.mjs';

const desiredDaemonPort = Number(process.env.OD_PORT) || 17_456;
const desiredNextPort = Number(process.env.NEXT_PORT) || 17_573;
const { daemonPort, appPort: nextPort } = await resolveDevPorts({
  daemonStart: desiredDaemonPort,
  appStart: desiredNextPort,
  appLabel: 'next',
  searchRange: 200,
});
const baseURL = `http://127.0.0.1:${nextPort}`;

export default defineConfig({
  testDir: './specs',
  outputDir: './reports/test-results',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  reporter: process.env.CI
    ? [
        ['github'],
        ['list'],
        ['html', { open: 'never', outputFolder: './reports/playwright-html-report' }],
        ['json', { outputFile: './reports/results.json' }],
        ['junit', { outputFile: './reports/junit.xml' }],
        ['./reporters/markdown-reporter.cjs', { outputFile: './reports/latest.md' }],
      ]
    : [
        ['list'],
        ['html', { open: 'never', outputFolder: './reports/playwright-html-report' }],
        ['json', { outputFile: './reports/results.json' }],
        ['junit', { outputFile: './reports/junit.xml' }],
        ['./reporters/markdown-reporter.cjs', { outputFile: './reports/latest.md' }],
      ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command:
      `OD_DATA_DIR=e2e/.od-data ` +
      `OD_PORT=${daemonPort} OD_PORT_STRICT=1 ` +
      `NEXT_PORT=${nextPort} NEXT_PORT_STRICT=1 pnpm --dir .. run dev:all`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
