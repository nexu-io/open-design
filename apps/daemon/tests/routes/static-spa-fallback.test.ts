import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  registerStaticSpaFallback,
  resolveStaticSpaFallbackPath,
} from '../../src/static-spa.js';

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

  it('serves the SPA shell when the installation has a hidden parent directory', async () => {
    const hiddenStaticDir = path.join(tempDir, '.open-design', 'apps', 'web', 'out');
    mkdirSync(hiddenStaticDir, { recursive: true });
    writeFileSync(path.join(hiddenStaticDir, 'index.html'), '<!doctype html><title>Open Design</title>');
    const app = express();
    registerStaticSpaFallback(app, hiddenStaticDir);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('failed to bind SPA fallback test server');
    }

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/projects/example`, {
        headers: { accept: 'text/html' },
      });
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toContain('<title>Open Design</title>');
    } finally {
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error != null) rejectClose(error);
          else resolveClose();
        });
      });
    }
  });
});
