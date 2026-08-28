import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

test.use({ allowDisplayDevTestApiUrl: true });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  await applyStandardMocks(page);
});

test('Share menu deploys an HTML preview to display.dev anonymously and shows the claim URL', async ({ page, toolsDev }, testInfo) => {
  const displayDev = await createDisplayDevMock();
  const projectId = `displaydev-e2e-${Date.now()}`;
  const fileName = 'displaydev-preview.html';
  let restoreDisplayDevConfig = async () => {};

  try {
    const { conversationId } = await createProjectViaApi(page, projectId, 'display.dev deploy E2E');
    await seedHtmlArtifact(
      page,
      projectId,
      fileName,
      '<!doctype html><html><body><main><h1>display.dev E2E Preview</h1></main></body></html>',
    );
    restoreDisplayDevConfig = await seedDisplayDevConfig(toolsDev, displayDev.baseUrl);
    const savedDefault = await page.request.put('/api/deploy/config', {
      data: { providerId: 'displaydev-self', displayDev: { defaultArtifactName: 'Old saved name' } },
    });
    expect(savedDefault.ok(), await savedDefault.text()).toBeTruthy();

    await page.goto(`/projects/${projectId}/conversations/${conversationId}`, { waitUntil: 'domcontentloaded' });
    await waitForLoadingToClear(page);
    await expect(page.getByRole('tab', { name: new RegExp(fileName.replace(/\./g, '\\.'), 'i') })).toBeVisible();
    await expect(page.frameLocator('[data-testid="artifact-preview-frame"]').getByRole('heading', { name: 'display.dev E2E Preview' })).toBeVisible();

    await page.getByRole('button', { name: /^Share$/ }).click();
    await page.getByRole('menuitem', { name: /Deploy to display\.dev/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Deploy to display.dev' })).toBeVisible();
    await expect(dialog.getByText('Leave blank to publish anonymously with a 30-day URL and claim link.')).toBeVisible();
    await expect(dialog.getByLabel('Visibility')).toHaveCount(0);
    await expect(dialog.getByLabel('Show branding')).toHaveCount(0);
    await expect(dialog.getByLabel('Share with')).toHaveCount(0);
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Old saved name');
    await dialog.getByLabel('Name', { exact: true }).fill('');

    await dialog.getByRole('button', { name: 'Deploy to display.dev' }).click();

    const resultBlock = dialog.locator('.deploy-result-block');
    await expect(resultBlock.getByRole('link', { name: displayDev.previewUrl })).toBeVisible();
    await expect(resultBlock.getByRole('link', { name: displayDev.claimUrl })).toBeVisible();
    await expect
      .poll(() => displayDev.artifactRequests.length, { timeout: T.medium })
      .toBe(1);
    expect(displayDev.artifactRequests[0]).toMatchObject({
      method: 'POST',
      path: '/v1/public/artifacts',
      authorization: '',
    });
    expect(displayDev.artifactRequests[0]?.fieldNames).not.toContain('name');
    const clearedDefault = await page.request.get('/api/deploy/config?providerId=displaydev-self');
    expect(clearedDefault.ok(), await clearedDefault.text()).toBeTruthy();
    expect((await clearedDefault.json()).displayDev?.defaultArtifactName ?? '').toBe('');
    expect(displayDev.previewRequests).toEqual([]);
    await expect(page.getByText('Deployment uploaded successfully', { exact: true })).toBeHidden();
    await resultBlock.scrollIntoViewIfNeeded();
    await dialog.screenshot({ path: testInfo.outputPath('anonymous-published.png') });
  } finally {
    try {
      await restoreDisplayDevConfig();
    } finally {
      await displayDev.close();
    }
  }
});

test('Share menu redeploys an authenticated display.dev preview with the current base version', async ({ page, toolsDev }, testInfo) => {
  const displayDev = await createDisplayDevMock();
  const projectId = `displaydev-auth-e2e-${Date.now()}`;
  const fileName = 'displaydev-auth-preview.html';
  let restoreDisplayDevConfig = async () => {};

  try {
    const { conversationId } = await createProjectViaApi(page, projectId, 'display.dev authenticated deploy E2E');
    await seedHtmlArtifact(
      page,
      projectId,
      fileName,
      '<!doctype html><html><body><main><h1>display.dev Auth E2E Preview</h1></main></body></html>',
    );
    restoreDisplayDevConfig = await seedDisplayDevConfig(toolsDev, displayDev.baseUrl, 'sk_liveE2eSecret');

    await page.goto(`/projects/${projectId}/conversations/${conversationId}`, { waitUntil: 'domcontentloaded' });
    await waitForLoadingToClear(page);
    await expect(page.frameLocator('[data-testid="artifact-preview-frame"]').getByRole('heading', { name: 'display.dev Auth E2E Preview' })).toBeVisible();

    await page.getByRole('button', { name: /^Share$/ }).click();
    await page.getByRole('menuitem', { name: /Deploy to display\.dev/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Deploy to display.dev' })).toBeVisible();
    await expect(dialog.getByLabel('Visibility')).toBeVisible();
    await expect(dialog.getByRole('option', { name: 'Account default', exact: true })).toHaveCount(1);
    await expect(dialog.getByLabel('Show branding')).toHaveCount(0);

    const clearKeyResponse = await page.request.put('/api/deploy/config', {
      data: { providerId: 'displaydev-self', clearToken: true },
    });
    expect(clearKeyResponse.ok(), await clearKeyResponse.text()).toBeTruthy();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByText(/saved display.dev API key was removed/i)).toBeVisible();
    await expect(dialog.getByLabel('display.dev API key (optional)')).toHaveValue('saved-displaydev-token');
    await dialog.getByRole('button', { name: 'Deploy to display.dev' }).click();
    await expect(dialog.getByText('The saved display.dev API key was removed. Reload settings or enter an API key before publishing.')).toBeVisible();
    expect(displayDev.artifactRequests).toEqual([]);
    const restoreKeyResponse = await page.request.put('/api/deploy/config', {
      data: { providerId: 'displaydev-self', token: 'sk_liveE2eSecret' },
    });
    expect(restoreKeyResponse.ok(), await restoreKeyResponse.text()).toBeTruthy();
    await dialog.getByLabel('Name', { exact: true }).fill('Saved E2E preview');
    const resumePublish = displayDev.pauseNextPublish();
    await dialog.getByRole('button', { name: 'Deploy to display.dev' }).click();
    await expect.poll(() => displayDev.artifactRequests.filter((request) => request.method === 'POST').length).toBe(1);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: /^Share$/ }).click();
    await page.getByRole('menuitem', { name: /Deploy to display\.dev/i }).click();
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Saved E2E preview');
    await expect(dialog.getByLabel('Name', { exact: true })).toBeDisabled();
    resumePublish();
    await expect(dialog.locator('.deploy-result-block').getByRole('link', { name: displayDev.previewUrl })).toBeVisible();

    await expect(dialog.getByRole('option', { name: 'Account default', exact: true })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Redeploy to display.dev' }).click();
    await expect.poll(() => displayDev.artifactRequests.filter((request) => request.method === 'PUT').length).toBe(1);
    const savedNameResponse = await page.request.get('/api/deploy/config?providerId=displaydev-self');
    expect(await savedNameResponse.json()).toMatchObject({ displayDev: { defaultArtifactName: 'Saved E2E preview' } });

    await dialog.getByLabel('Visibility').selectOption('private');
    await dialog.getByLabel('Share with').fill('qa@example.com');
    await dialog.getByLabel('display.dev API key (optional)').fill('sk_liveE2eRotatedSecret');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Redeploy to display.dev' })).toBeEnabled();
    await expect(dialog.getByLabel('display.dev API key (optional)')).not.toHaveValue('sk_liveE2eRotatedSecret');
    await expect(dialog.getByLabel('Visibility')).toHaveValue('private');
    await expect(dialog.getByLabel('Share with')).toHaveValue('qa@example.com');
    await dialog.getByRole('button', { name: 'Redeploy to display.dev' }).click();

    await expect
      .poll(() => displayDev.artifactRequests.filter((request) => request.method === 'PUT').length, { timeout: T.medium })
      .toBe(2);
    const postRequest = displayDev.artifactRequests.find((request) => request.method === 'POST');
    const getRequests = displayDev.artifactRequests.filter((request) => request.method === 'GET');
    const putRequest = displayDev.artifactRequests.filter((request) => request.method === 'PUT')[1];
    expect(postRequest).toMatchObject({
      path: '/v1/artifacts',
      authorization: 'Bearer sk_liveE2eSecret',
      ifMatch: '',
    });
    expect(postRequest?.fieldNames).not.toContain('visibility');
    expect(getRequests.length).toBeGreaterThanOrEqual(1);
    expect(getRequests[0]).toMatchObject({
      method: 'GET',
      path: '/v1/artifacts/e2eDisplayDev',
      authorization: 'Bearer sk_liveE2eSecret',
      ifMatch: '',
    });
    expect(putRequest).toMatchObject({
      method: 'PUT',
      path: '/v1/artifacts/e2eDisplayDev',
      authorization: 'Bearer sk_liveE2eRotatedSecret',
      ifMatch: '"v2"',
    });
    expect(putRequest?.fieldNames).toEqual(expect.arrayContaining(['visibility', 'sharedWith']));
    expect(putRequest?.fieldValues).toMatchObject({
      visibility: ['private'],
      sharedWith: ['qa@example.com'],
    });

    await expect(dialog.getByLabel('Visibility')).toHaveValue('private');
    await expect(dialog.getByLabel('Share with')).toHaveValue('qa@example.com');
    await dialog.getByLabel('Visibility').selectOption('company');
    await expect(dialog.getByLabel('Share with')).toHaveValue('qa@example.com');
    await dialog.getByRole('button', { name: 'Redeploy to display.dev' }).click();

    await expect
      .poll(() => displayDev.artifactRequests.filter((request) => request.method === 'PUT').length, { timeout: T.medium })
      .toBe(3);
    const visibilityOnlyRequest = displayDev.artifactRequests.filter((request) => request.method === 'PUT')[2];
    expect(visibilityOnlyRequest?.fieldValues.visibility).toEqual(['company']);
    expect(visibilityOnlyRequest?.fieldNames).not.toContain('sharedWith');
    expect(visibilityOnlyRequest?.fieldNames).not.toContain('clearSharedWith');
    await expect(dialog.getByLabel('Share with')).toHaveValue('qa@example.com');
    expect(displayDev.previewRequests).toEqual([]);
    await expect(page.getByText('Deployment uploaded successfully', { exact: true })).toBeHidden();
    await dialog.screenshot({ path: testInfo.outputPath('authenticated-redeployed.png') });
  } finally {
    try {
      await restoreDisplayDevConfig();
    } finally {
      await displayDev.close();
    }
  }
});

async function createDisplayDevMock() {
  const artifactRequests: Array<{
    method: string;
    path: string;
    authorization: string;
    ifMatch: string;
    fieldNames: string[];
    fieldValues: Record<string, string[]>;
  }> = [];
  const previewRequests: string[] = [];
  let baseUrl = '';
  let currentVersion = 0;
  let currentVisibility: 'public' | 'company' | 'private' = 'company';
  let currentSharedWith: string[] = [];
  let publishGate: Promise<void> | undefined;
  let releasePublish = () => {};
  const previewPath = '/preview/e2e-displaydev';
  const claimUrl = 'https://app.display.dev/claim?code=e2e-displaydev';

  const recordArtifactRequest = async (req: IncomingMessage, path: string) => {
    const body = await readRequestBody(req);
    const request = {
      method: req.method || '',
      path,
      authorization: req.headers.authorization || '',
      ifMatch: typeof req.headers['if-match'] === 'string' ? req.headers['if-match'] : '',
      fieldNames: Array.from(body.matchAll(/name="([^"]+)"/g), (match) => match[1]!),
      fieldValues: multipartTextFields(body),
    };
    artifactRequests.push(request);
    return request;
  };

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', baseUrl || 'http://127.0.0.1');
    if ((req.method === 'HEAD' || req.method === 'GET') && url.pathname === previewPath) {
      previewRequests.push(req.method);
      res.writeHead(200, { 'content-type': 'text/html' });
      if (req.method === 'GET') res.end('<!doctype html><h1>display.dev mock preview</h1>');
      else res.end();
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/public/artifacts') {
      await recordArtifactRequest(req, url.pathname);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        shortId: 'e2eDisplayDev',
        previewUrl: `${baseUrl}${previewPath}`,
        claimUrl,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/artifacts') {
      const request = await recordArtifactRequest(req, url.pathname);
      await publishGate;
      currentVersion = 1;
      currentVisibility = accessVisibilityFromRequest(request.fieldValues.visibility?.[0]) ?? 'company';
      currentSharedWith = request.fieldValues.sharedWith ?? [];
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        shortId: 'e2eDisplayDev',
        url: `${baseUrl}${previewPath}`,
        version: currentVersion,
        name: 'display.dev authenticated deploy E2E',
      }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/artifacts/e2eDisplayDev') {
      await recordArtifactRequest(req, url.pathname);
      res.writeHead(200, { 'content-type': 'application/json', etag: `"v${currentVersion}"` });
      res.end(JSON.stringify({
        shortId: 'e2eDisplayDev',
        url: `${baseUrl}${previewPath}`,
        currentVersion,
        visibility: currentVisibility,
        sharedWith: currentSharedWith,
      }));
      return;
    }

    if (req.method === 'PUT' && url.pathname === '/v1/artifacts/e2eDisplayDev') {
      const request = await recordArtifactRequest(req, url.pathname);
      if (req.headers['if-match'] !== `"v${currentVersion}"`) {
        res.writeHead(428, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          error: 'precondition_required',
          message: 'Republishing requires a base version. Fetch the latest artifact version, then publish with that base version.',
          details: { current_version: currentVersion },
        }));
        return;
      }
      currentVersion += 1;
      currentVisibility = accessVisibilityFromRequest(request.fieldValues.visibility?.[0]) ?? currentVisibility;
      if (request.fieldValues.clearSharedWith?.[0] === 'true') currentSharedWith = [];
      else if (request.fieldValues.sharedWith) currentSharedWith = request.fieldValues.sharedWith;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        shortId: 'e2eDisplayDev',
        url: `${baseUrl}${previewPath}`,
        version: currentVersion,
        name: 'display.dev authenticated deploy E2E',
      }));
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    claimUrl,
    previewUrl: `${baseUrl}${previewPath}`,
    artifactRequests,
    previewRequests,
    pauseNextPublish: () => {
      publishGate = new Promise<void>((resolve) => { releasePublish = resolve; });
      return () => {
        releasePublish();
        publishGate = undefined;
      };
    },
    close: () => {
      releasePublish();
      return closeServer(server);
    },
  };
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function multipartTextFields(body: string): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  const pattern = /Content-Disposition: form-data; name="([^"]+)"(?:; filename="[^"]*")?\r\n(?:Content-Type:[^\r\n]+\r\n)?\r\n([\s\S]*?)(?=\r\n--)/g;
  for (const match of body.matchAll(pattern)) {
    if (match[0].includes('filename="')) continue;
    const name = match[1]!;
    (fields[name] ??= []).push(match[2] ?? '');
  }
  return fields;
}

function accessVisibilityFromRequest(value: string | undefined): 'public' | 'company' | 'private' | null {
  return value === 'public' || value === 'company' || value === 'private' ? value : null;
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function createProjectViaApi(page: Page, projectId: string, name: string) {
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

async function seedHtmlArtifact(page: Page, projectId: string, fileName: string, content: string) {
  const response = await page.request.post(`/api/projects/${projectId}/files`, {
    data: {
      name: fileName,
      content,
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: fileName,
        entry: fileName,
        renderer: 'html',
        exports: ['html'],
      },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function seedDisplayDevConfig(
  toolsDev: { dataDir: string },
  apiUrl: string,
  token = '',
) {
  const configPath = join(toolsDev.dataDir, 'displaydev.json');
  const previousConfig = await readFile(configPath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });

  await writeFile(
    configPath,
    `${JSON.stringify({ token, apiUrl }, null, 2)}\n`,
    { mode: 0o600 },
  );

  return async () => {
    if (previousConfig == null) {
      await rm(configPath, { force: true });
      return;
    }
    await writeFile(configPath, previousConfig, { mode: 0o600 });
  };
}

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading Open Design...').waitFor({ state: 'hidden', timeout: T.medium }).catch(() => {});
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.medium }).catch(() => {});
}
