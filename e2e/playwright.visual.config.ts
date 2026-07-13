import { defineConfig, devices } from '@playwright/test';

const daemonPort = Number(process.env.OD_PORT) || 17_456;
const webPort = Number(process.env.OD_WEB_PORT) || 17_573;
const baseURL = `http://127.0.0.1:${webPort}`;
const namespace = process.env.OD_E2E_NAMESPACE || `playwright-visual-${process.pid}`;
const dataDir = process.env.OD_E2E_DATA_DIR || `e2e/ui/.od-data/${namespace}`;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export default defineConfig({
  testDir: './ui',
  testMatch: 'visual-*.test.ts',
  outputDir: './ui/reports/visual-test-results',
  timeout: Number(process.env.OD_PLAYWRIGHT_TIMEOUT) || 30_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['list'], ['json', { outputFile: './ui/reports/visual-results.json' }]]
    : [['list'], ['json', { outputFile: './ui/reports/visual-results.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'off',
    screenshot: 'off',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command:
      `OD_DATA_DIR=${shellQuote(dataDir)} ` +
      `pnpm --dir .. tools-dev run web --namespace ${shellQuote(namespace)} --daemon-port ${daemonPort} --web-port ${webPort}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
