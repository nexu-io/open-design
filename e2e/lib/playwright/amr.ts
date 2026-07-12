import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { T } from '@/timeouts';

export const STORAGE_KEY = 'open-design:config';
export const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定|Account & settings/i;

export async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long }).catch(() => {});
}

export async function dismissPrivacyDialog(page: Page) {
  const privacySurface = page
    .getByRole('region', { name: /Help us improve Open Design/i })
    .or(page.locator('.privacy-consent-banner'))
    .first();
  await privacySurface.waitFor({ state: 'visible', timeout: 1_000 }).catch(() => {});
  if (await privacySurface.isVisible().catch(() => false)) {
    await privacySurface.getByRole('button', { name: /not now|i get it|got it/i }).click();
    await expect(privacySurface).toBeHidden();
  }
}

export async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
}

export async function expectWorkspaceReady(page: Page) {
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
}

export async function openSettingsDialog(page: Page) {
  await waitForLoadingToClear(page);
  const dialog = page.getByRole('dialog');
  const settingsTrigger = page
    .getByTestId('entry-settings-button')
    .or(page.getByTestId('entry-settings-menu-trigger'))
    .or(page.getByRole('button', { name: OPEN_SETTINGS_LABEL }))
    .first();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await dialog.isVisible().catch(() => false)) return dialog;

    await dismissPrivacyDialog(page);
    if (await settingsTrigger.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await settingsTrigger.evaluate((element: HTMLElement) => element.click());
    } else {
      const fallback = page.getByRole('button', { name: OPEN_SETTINGS_LABEL }).first();
      await expect(fallback).toBeVisible({ timeout: T.medium });
      await fallback.evaluate((element: HTMLElement) => element.click());
    }

    const detailsTrigger = page.getByTestId('entry-settings-open-details').first();
    if (await detailsTrigger.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await detailsTrigger.click();
    }

    await expect
      .poll(
        async () => {
          if (await dialog.isVisible().catch(() => false)) return 'dialog';
          return 'pending';
        },
        { timeout: T.medium },
      )
      .not.toBe('pending')
      .catch(() => {});

    if (await dialog.isVisible().catch(() => false)) return dialog;
  }

  await expect(dialog).toBeVisible({ timeout: T.medium });
  return dialog;
}

export async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.click();
  await input.fill(prompt);
  await expect(page.getByTestId('chat-send')).toBeEnabled();
  await input.press('Enter');
}

export async function createProjectViaApi(page: Page, projectId: string, name: string) {
  const response = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name,
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as { conversationId: string };
}

export async function gotoProject(page: Page, projectId: string) {
  try {
    await page.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/ERR_ABORTED|frame was detached/i.test(message)) throw error;
  }
  await dismissPrivacyDialog(page);
  await expectWorkspaceReady(page);
}

export async function putAppConfig(page: Page, config: Record<string, unknown>) {
  const response = await page.request.put('/api/app-config', { data: config });
  expect(response.ok(), await response.text()).toBeTruthy();
}

export async function readAppConfig(page: Page) {
  const response = await page.request.get('/api/app-config');
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as { config?: Record<string, unknown> };
}

export async function seedBrowserConfig(page: Page, value: Record<string, unknown>) {
  const payload = { key: STORAGE_KEY, config: value };
  await page.addInitScript(
    ({ key, config }) => {
      window.localStorage.setItem(key, JSON.stringify(config));
    },
    payload,
  );
  await page.evaluate(({ key, config }) => {
    window.localStorage.setItem(key, JSON.stringify(config));
  }, payload).catch(() => {
    // Some pre-navigation pages do not expose localStorage yet; the init script above covers the next load.
  });
}
