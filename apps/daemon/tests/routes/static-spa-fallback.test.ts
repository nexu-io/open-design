import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerStaticSpaFallback } from '../../src/static-spa.js';
import { resolveStaticSpaFallbackPath } from '../../src/server.js';

describe('static SPA fallback', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-static-spa-'));
    writeFileSync(path.join(tempDir, 'index.html'), '<!doctype html><div id="root"></div>');
    writeFileSync(path.join(tempDir, 'app-icon.svg'), '<svg />');
  });

  afterEach(() => {
    rmSync(tempDir, { force: true, recursive: true });
  });

  function request(pathname: string, accept = 'text/html', method = 'GET') {
    return {
      get(name: string) {
        return name.toLowerCase() === 'accept' ? accept : undefined;
      },
      method,
      path: pathname,
    };
  }

  it('resolves the SPA shell for deep app routes', () => {
    expect(resolveStaticSpaFallbackPath(request('/automations'), tempDir))
      .toBe(path.join(tempDir, 'index.html'));
    expect(resolveStaticSpaFallbackPath(request('/projects/proj-1/files/index.html'), tempDir))
      .toBe(path.join(tempDir, 'index.html'));
  });

  it('serves deep routes when the static root contains a hidden directory', async () => {
    const rootDir = mkdtempSync(path.join(os.tmpdir(), 'od-static-spa-hidden-'));
    const staticDir = path.join(rootDir, '.hermes', 'apps', 'web', 'out');
    mkdirSync(staticDir, { recursive: true });
    writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><div id="root">SPA</div>');

    const app = express();
    registerStaticSpaFallback(app, staticDir);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    try {
      const address = server.address();
      if (address == null || typeof address === 'string') throw new Error('server did not bind');
      const response = await new Promise<{ body: string; statusCode: number | undefined }>((resolve, reject) => {
        const request = http.get({
          host: '127.0.0.1',
          path: '/projects/project-1/conversations/conversation-1/files/docs/task.md',
          port: address.port,
          headers: { Accept: 'text/html' },
        }, (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => resolve({ body, statusCode: res.statusCode }));
        });
        request.on('error', reject);
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('<div id="root">SPA</div>');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('leaves API and framework asset misses to downstream 404 handling', () => {
    expect(resolveStaticSpaFallbackPath(request('/api/routines/nope'), tempDir)).toBeNull();
    expect(resolveStaticSpaFallbackPath(request('/artifacts/missing'), tempDir)).toBeNull();
    expect(resolveStaticSpaFallbackPath(request('/frames/missing'), tempDir)).toBeNull();
    expect(resolveStaticSpaFallbackPath(request('/_next/static/missing.js'), tempDir)).toBeNull();
  });

  it('requires an HTML-capable request and an emitted shell', () => {
    expect(resolveStaticSpaFallbackPath(request('/automations', 'application/json'), tempDir)).toBeNull();
    expect(resolveStaticSpaFallbackPath(request('/automations', 'text/html', 'POST'), tempDir)).toBeNull();

    const emptyDir = mkdtempSync(path.join(os.tmpdir(), 'od-static-spa-empty-'));
    try {
      expect(resolveStaticSpaFallbackPath(request('/automations'), emptyDir)).toBeNull();
    } finally {
      rmSync(emptyDir, { force: true, recursive: true });
    }
  });
});
