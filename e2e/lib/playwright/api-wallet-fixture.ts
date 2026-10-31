import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page, TestInfo } from '@playwright/test';
import { expect } from './suite.js';
import { T } from '../timeouts.js';

export type WalletActor = { userId: string; email: string; cookie: string; controlKey: string; runtimeKey: string; deviceKeyId: string };
export type ApiWalletFixture = {
  schema: 'api001-real-client-v1';
  tuple: { amr: string; 'open-design': string };
  model: string;
  workspaceId: string;
  ownerMemberId: string;
  memberMemberId: string;
  actors: { owner: WalletActor; member: WalletActor };
  cfg: { name: string; sourceRoot: string; urls: { api: string; link: string; web: string }; databaseUrl: string };
};
export async function loadApiWalletFixture(directory: string): Promise<ApiWalletFixture> {
  const path = resolve(directory, 'api001-fixture.private.json');
  expect((await stat(path)).mode & 0o077, 'real credentials fixture must be private').toBe(0);
  const f = JSON.parse(await readFile(path, 'utf8')) as ApiWalletFixture;
  expect(f.schema).toBe('api001-real-client-v1');
  expect(f.cfg.name).toMatch(/^qa-phase1-regression-[a-z0-9-]+$/);
  for (const url of Object.values(f.cfg.urls)) expect(['127.0.0.1', 'localhost']).toContain(new URL(url).hostname);
  for (const sha of Object.values(f.tuple)) expect(sha).toMatch(/^[0-9a-f]{40}$/);
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(new URL('../../../', import.meta.url)), encoding: 'utf8' }).trim();
  expect(f.tuple['open-design'], 'fixture must identify this actual OD worktree commit').toBe(actual);
  return f;
}
export function runApiWalletAction(f: ApiWalletFixture, directory: string, action: 'consume-api' | 'resume-client' | 'audit'): void {
  const output = execFileSync('corepack', ['pnpm', '--dir', f.cfg.sourceRoot, '--filter', '@vela/api', 'exec', 'tsx',
    'test/e2e/api-shared-real-client-fixture.ts', action, resolve(directory)], { env: process.env, stdio: 'pipe', timeout: T.xlong * 2 });
  writeFileSync(resolve(directory, `api001-${action}.stdout.private.log`), output, { mode: 0o600 });
}
async function targetReady(page: Page, testId: string): Promise<void> {
  const confirmation = page.getByRole('button', { name: 'Switch to QA API001 Shared', exact: true });
  await expect.poll(async () => await page.getByTestId(testId).isVisible() || await confirmation.isVisible(), { timeout: T.xlong }).toBe(true);
  if (await confirmation.isVisible()) await confirmation.click();
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: T.xlong });
}
export async function walletEvidence(page: Page, info: TestInfo, evidence: string, name: string): Promise<void> {
  const body = await page.screenshot({ fullPage: true });
  await mkdir(evidence, { recursive: true });
  await writeFile(resolve(evidence, `${name}.png`), body);
  await info.attach(name, { body, contentType: 'image/png' });
}
export async function createOwnWalletKeys(browser: Browser, f: ApiWalletFixture, directory: string, evidence: string, info: TestInfo): Promise<void> {
  const keys: Record<string, { id: string; secret: string }> = {};
  const observations: unknown[] = [];
  for (const role of ['owner', 'member'] as const) {
    const actor = f.actors[role];
    const memberId = role === 'owner' ? f.ownerMemberId : f.memberMemberId;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
    try {
      await context.addCookies(actor.cookie.split('; ').map((part) => ({ name: part.slice(0, part.indexOf('=')), value: part.slice(part.indexOf('=') + 1), url: f.cfg.urls.web, httpOnly: true, sameSite: 'Lax' as const })));
      const page = await context.newPage();
      await page.goto(`${f.cfg.urls.web}/api-keys?workspaceId=${encodeURIComponent(f.workspaceId)}`, { waitUntil: 'domcontentloaded' });
      await targetReady(page, 'api-keys-page');
      await expect(page.getByRole('link', { name: /API Keys/i }).first()).toBeVisible();
      await page.getByRole('button', { name: 'Create API key', exact: true }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Create API key' });
      const name = `QA API001 ${role}`;
      await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
      const created = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/workspaces/${f.workspaceId}/runtime-api-keys`, { timeout: T.long });
      await dialog.getByRole('button', { name: 'Create API key', exact: true }).click();
      const response = await created;
      expect(response.status()).toBe(201);
      expect(response.request().headers()['x-vela-workspace-id']).toBe(f.workspaceId);
      expect(response.request().headers()['x-vela-workspace-member-id']).toBe(memberId);
      const body = await response.json() as { key: { id: string; workspaceId: string }; rawKey: string };
      const secret = await page.getByTestId('revealed-api-key').innerText();
      expect(secret).toMatch(/^sk-/);
      expect(body.key.id).toBeTruthy();
      keys[role] = { id: body.key.id, secret };
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await page.getByText(name, { exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByText(name, { exact: true })).toBeInViewport();
      await expect(page.getByTestId('api-keys-page')).not.toContainText(secret);
      await expect(page.getByTestId('api-keys-page')).not.toContainText(`QA API001 ${role === 'owner' ? 'member' : 'owner'}`);
      await walletEvidence(page, info, evidence, `api001-${role}-own-key`);
      observations.push({ role, workspaceId: f.workspaceId, memberId, createdStatus: 201, requestPath: new URL(response.url()).pathname, keyId: body.key.id });
    } finally { await context.close(); }
  }
  await writeFile(resolve(directory, 'api001-ui-keys.private.json'), JSON.stringify(keys), { mode: 0o600 });
  await writeFile(resolve(evidence, 'api001-key-pages.safe.json'), JSON.stringify(observations, null, 2));
}
export async function readConsoleWallets(browser: Browser, f: ApiWalletFixture, evidence: string, info: TestInfo): Promise<void> {
  for (const role of ['owner', 'member'] as const) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
    try {
      await context.addCookies(f.actors[role].cookie.split('; ').map((part) => ({ name: part.slice(0, part.indexOf('=')), value: part.slice(part.indexOf('=') + 1), url: f.cfg.urls.web, httpOnly: true, sameSite: 'Lax' as const })));
      const page = await context.newPage();
      await page.goto(`${f.cfg.urls.web}/dashboard?workspaceId=${encodeURIComponent(f.workspaceId)}`, { waitUntil: 'domcontentloaded' });
      const confirm = page.getByRole('button', { name: 'Switch to QA API001 Shared', exact: true });
      await expect.poll(async () => await page.getByTestId('seats-wallet-total').isVisible() || await confirm.isVisible(), { timeout: T.xlong }).toBe(true);
      if (await confirm.isVisible()) await confirm.click();
      await expect(page.getByTestId('seats-wallet-total')).toContainText('$5.00', { timeout: T.long });
      await walletEvidence(page, info, evidence, `api001-${role}-wallet-five`);
    } finally { await context.close(); }
  }
}
