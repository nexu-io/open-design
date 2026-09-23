import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('serves the shell relative to a hidden static root', () => {
    const staticDir = path.join(tempDir, '.hermes', 'apps', 'web', 'out');
    const indexPath = path.join(staticDir, 'index.html');
    const app = { get: vi.fn() };
    const response = { sendFile: vi.fn() };
    const next = vi.fn();

    expect(() => registerStaticSpaFallback(app as never, staticDir)).not.toThrow();
    const handler = app.get.mock.calls[0]?.[1];
    expect(handler).toBeTypeOf('function');

    mkdirSync(staticDir, { recursive: true });
    writeFileSync(indexPath, '<!doctype html>');
    handler(request('/projects/proj-1'), response, next);

    expect(response.sendFile).toHaveBeenCalledWith('index.html', { root: staticDir });
    expect(next).not.toHaveBeenCalled();
  });
});
