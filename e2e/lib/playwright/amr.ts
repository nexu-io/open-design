import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const STORAGE_KEY = 'open-design:config';
export const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定|Account & settings/i;
export const SETTINGS_MENU_LABEL = /Settings|设置|設定/i;

export async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: 15_000 });
}

export async function dismissPrivacyDialog(page: Page) {
  const privacyRegion = page.getByRole('region', { name: /Help us improve Open Design/i });
  if (await privacyRegion.isVisible().catch(() => false)) {
    await privacyRegion.getByRole('button', { name: /not now|i get it|got it/i }).click();
    await expect(privacyRegion).toBeHidden();
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
  await dismissPrivacyDialog(page);
  const settingsTrigger = page.getByTestId('entry-settings-menu-trigger');
  if (await settingsTrigger.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await settingsTrigger.click();
  } else {
    await page.getByRole('button', { name: OPEN_SETTINGS_LABEL }).first().click();
  }
  const dialog = page.getByRole('dialog');
  const menu = page
    .getByTestId('entry-settings-menu')
    .or(page.getByRole('menu', { name: SETTINGS_MENU_LABEL }))
    .first();
  await expect
    .poll(async () => {
      if (await dialog.isVisible().catch(() => false)) return 'dialog';
      if (await menu.isVisible().catch(() => false)) return 'menu';
      return 'pending';
    })
    .not.toBe('pending');
  if (await menu.isVisible().catch(() => false)) {
    const settingsItem = menu
      .getByRole('menuitem', { name: SETTINGS_MENU_LABEL })
      .or(menu.getByRole('button', { name: SETTINGS_MENU_LABEL }))
      .first();
    await expect(settingsItem).toBeVisible({ timeout: 10_000 });
    await settingsItem.click();
  }
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

export async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.click();
  await input.fill(prompt);
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
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
  await page.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
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
  await page.addInitScript(
    ({ key, config }) => {
      window.localStorage.setItem(key, JSON.stringify(config));
    },
    { key: STORAGE_KEY, config: value },
  );
}
