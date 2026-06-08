import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const execFileAsync = promisify(execFile);
const STORAGE_KEY = 'open-design:config';

test.describe.configure({ timeout: 45_000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: {},
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
      }),
    );
  }, STORAGE_KEY);
});

test('[P1] diagnostics export zip includes the primary daemon, web, and desktop logs', async ({ page }) => {
  await gotoEntryHome(page);

  const response = await page.request.get('/api/diagnostics/export');
  expect(response.ok(), await response.text()).toBeTruthy();
  expect(response.headers()['content-type']).toContain('application/zip');

  const tmpRoot = await mkdtemp(path.join(tmpdir(), 'od-diagnostics-e2e-'));
  try {
    const zipPath = path.join(tmpRoot, 'diagnostics.zip');
    await writeFile(zipPath, Buffer.from(await response.body()));

    const names = await unzipList(zipPath);
    expect(names).toEqual(expect.arrayContaining([
      'summary/manifest.json',
      'logs/daemon/latest.log',
      'logs/web/latest.log',
      'logs/desktop/latest.log',
    ]));

    const manifest = JSON.parse(await unzipRead(zipPath, 'summary/manifest.json')) as {
      files?: Array<{ name?: string; missing?: boolean }>;
    };
    const manifestNames = new Set((manifest.files ?? []).map((file) => file.name).filter(Boolean));
    expect(manifestNames.has('logs/daemon/latest.log')).toBe(true);
    expect(manifestNames.has('logs/web/latest.log')).toBe(true);
    expect(manifestNames.has('logs/desktop/latest.log')).toBe(true);

    const daemonLog = await unzipRead(zipPath, 'logs/daemon/latest.log');
    const webLog = await unzipRead(zipPath, 'logs/web/latest.log');
    const desktopLog = await unzipRead(zipPath, 'logs/desktop/latest.log');
    expect(daemonLog.length).toBeGreaterThan(0);
    expect(webLog.length).toBeGreaterThan(0);
    expect(desktopLog.length).toBeGreaterThan(0);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
}

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: 15_000 });
}

async function unzipList(zipPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync('unzip', ['-Z1', zipPath]);
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function unzipRead(zipPath: string, entryName: string): Promise<string> {
  const { stdout } = await execFileAsync('unzip', ['-p', zipPath, entryName], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout;
}
