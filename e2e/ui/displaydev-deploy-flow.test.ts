import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
});

test('Share menu deploys an HTML preview to display.dev anonymously and shows the claim URL', async ({ page }) => {
  const displayDev = await createDisplayDevMock();
  const projectId = `displaydev-e2e-${Date.now()}`;
  const fileName = 'displaydev-preview.html';

  try {
    const { conversationId } = await createProjectViaApi(page, projectId, 'display.dev deploy E2E');
    await seedHtmlArtifact(
      page,
      projectId,
      fileName,
      '<!doctype html><html><body><main><h1>display.dev E2E Preview</h1></main></body></html>',
    );
    await configureAnonymousDisplayDevApiUrl(page, displayDev.baseUrl);

    await page.goto(`/projects/${projectId}/conversations/${conversationId}`, { waitUntil: 'domcontentloaded' });
    await waitForLoadingToClear(page);
    await expect(page.getByRole('tab', { name: new RegExp(fileName.replace(/\./g, '\\.'), 'i') })).toBeVisible();
    await expect(page.frameLocator('[data-testid="artifact-preview-frame"]').getByRole('heading', { name: 'display.dev E2E Preview' })).toBeVisible();

    await page.getByRole('button', { name: /^Share$/ }).click();
    await page.getByRole('menuitem', { name: /Deploy to display\.dev/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Deploy to display.dev' })).toBeVisible();
    await expect(dialog.getByText('Leave blank to publish anonymously with a 30-day URL and claim link.')).toBeVisible();

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
  } finally {
    await displayDev.close();
  }
});

test('Share menu redeploys an authenticated display.dev preview with the current base version', async ({ page }) => {
  const displayDev = await createDisplayDevMock();
  const projectId = `displaydev-auth-e2e-${Date.now()}`;
  const fileName = 'displaydev-auth-preview.html';

  try {
    const { conversationId } = await createProjectViaApi(page, projectId, 'display.dev authenticated deploy E2E');
    await seedHtmlArtifact(
      page,
      projectId,
      fileName,
      '<!doctype html><html><body><main><h1>display.dev Auth E2E Preview</h1></main></body></html>',
    );
    await configureAuthenticatedDisplayDev(page, displayDev.baseUrl);

    await page.goto(`/projects/${projectId}/conversations/${conversationId}`, { waitUntil: 'domcontentloaded' });
    await waitForLoadingToClear(page);
    await expect(page.frameLocator('[data-testid="artifact-preview-frame"]').getByRole('heading', { name: 'display.dev Auth E2E Preview' })).toBeVisible();

    await page.getByRole('button', { name: /^Share$/ }).click();
    await page.getByRole('menuitem', { name: /Deploy to display\.dev/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Deploy to display.dev' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Deploy to display.dev' }).click();
    await expect(dialog.locator('.deploy-result-block').getByRole('link', { name: displayDev.previewUrl })).toBeVisible();

    await dialog.getByLabel('Visibility').selectOption('private');
    await dialog.getByLabel('Share with').fill('qa@example.com');
    await dialog.getByRole('button', { name: 'Redeploy to display.dev' }).click();

    await expect
      .poll(() => displayDev.artifactRequests.some((request) => request.method === 'PUT'), { timeout: T.medium })
      .toBe(true);
    const postRequest = displayDev.artifactRequests.find((request) => request.method === 'POST');
    const getRequests = displayDev.artifactRequests.filter((request) => request.method === 'GET');
    const putRequest = displayDev.artifactRequests.find((request) => request.method === 'PUT');
    expect(postRequest).toMatchObject({
      path: '/v1/artifacts',
      authorization: 'Bearer dsp_live_secret',
      ifMatch: '',
    });
    expect(getRequests.length).toBeGreaterThanOrEqual(1);
    expect(getRequests[0]).toMatchObject({
      method: 'GET',
      path: '/v1/artifacts/e2eDisplayDev',
      authorization: 'Bearer dsp_live_secret',
      ifMatch: '',
    });
    expect(putRequest).toMatchObject({
      method: 'PUT',
      path: '/v1/artifacts/e2eDisplayDev',
      authorization: 'Bearer dsp_live_secret',
      ifMatch: '"v1"',
    });
  } finally {
    await displayDev.close();
  }
});

async function createDisplayDevMock() {
  const artifactRequests: Array<{ method: string; path: string; authorization: string; ifMatch: string }> = [];
  let baseUrl = '';
  let currentVersion = 0;
  const previewPath = '/preview/e2e-displaydev';
  const claimUrl = 'https://app.display.dev/claim?code=e2e-displaydev';

  const recordArtifactRequest = (req: IncomingMessage, path: string) => {
    artifactRequests.push({
      method: req.method || '',
      path,
      authorization: req.headers.authorization || '',
      ifMatch: typeof req.headers['if-match'] === 'string' ? req.headers['if-match'] : '',
    });
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', baseUrl || 'http://127.0.0.1');
    if ((req.method === 'HEAD' || req.method === 'GET') && url.pathname === previewPath) {
      res.writeHead(200, { 'content-type': 'text/html' });
      if (req.method === 'GET') res.end('<!doctype html><h1>display.dev mock preview</h1>');
      else res.end();
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/public/artifacts') {
      recordArtifactRequest(req, url.pathname);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        shortId: 'e2eDisplayDev',
        url: `${baseUrl}${previewPath}`,
        claimUrl,
        expiresAt: '2026-07-01T00:00:00.000Z',
      }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/artifacts') {
      recordArtifactRequest(req, url.pathname);
      currentVersion = 1;
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
      recordArtifactRequest(req, url.pathname);
      res.writeHead(200, { 'content-type': 'application/json', etag: `"v${currentVersion}"` });
      res.end(JSON.stringify({
        shortId: 'e2eDisplayDev',
        url: `${baseUrl}${previewPath}`,
        currentVersion,
        visibility: 'company',
        sharedWith: [],
        showBranding: null,
      }));
      return;
    }

    if (req.method === 'PUT' && url.pathname === '/v1/artifacts/e2eDisplayDev') {
      recordArtifactRequest(req, url.pathname);
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
    close: () => closeServer(server),
  };
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

async function configureAnonymousDisplayDevApiUrl(page: Page, apiUrl: string) {
  const response = await page.request.put('/api/deploy/config', {
    data: {
      providerId: 'displaydev-self',
      apiUrl,
      clearToken: true,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function configureAuthenticatedDisplayDev(page: Page, apiUrl: string) {
  const response = await page.request.put('/api/deploy/config', {
    data: {
      providerId: 'displaydev-self',
      apiUrl,
      token: 'dsp_live_secret',
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading Open Design...').waitFor({ state: 'hidden', timeout: T.medium }).catch(() => {});
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.medium }).catch(() => {});
}
