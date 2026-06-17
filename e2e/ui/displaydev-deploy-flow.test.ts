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
    await configureDisplayDevApiUrl(page, displayDev.baseUrl);

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
      .poll(() => displayDev.publishes.length, { timeout: T.medium })
      .toBe(1);
    expect(displayDev.publishes[0]).toMatchObject({
      method: 'POST',
      path: '/v1/public/artifacts',
      authorization: '',
    });
  } finally {
    await displayDev.close();
  }
});

async function createDisplayDevMock() {
  const publishes: Array<{ method: string; path: string; authorization: string }> = [];
  let baseUrl = '';
  const previewPath = '/preview/e2e-displaydev';
  const claimUrl = 'https://app.display.dev/claim?code=e2e-displaydev';

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', baseUrl || 'http://127.0.0.1');
    if ((req.method === 'HEAD' || req.method === 'GET') && url.pathname === previewPath) {
      res.writeHead(200, { 'content-type': 'text/html' });
      if (req.method === 'GET') res.end('<!doctype html><h1>display.dev mock preview</h1>');
      else res.end();
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/public/artifacts') {
      publishes.push({
        method: req.method,
        path: url.pathname,
        authorization: req.headers.authorization || '',
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        shortId: 'e2eDisplayDev',
        url: `${baseUrl}${previewPath}`,
        claimUrl,
        expiresAt: '2026-07-01T00:00:00.000Z',
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
    publishes,
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

async function configureDisplayDevApiUrl(page: Page, apiUrl: string) {
  const response = await page.request.put('/api/deploy/config', {
    data: {
      providerId: 'displaydev-self',
      apiUrl,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading Open Design...').waitFor({ state: 'hidden', timeout: T.medium }).catch(() => {});
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.medium }).catch(() => {});
}
