import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerStaticSpaFallback, resolveStaticSpaFallbackPath } from '../../src/static-spa.js';

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

  it('sends the shell relative to its root so dot-prefixed installation paths are allowed', () => {
    const get = vi.fn();
    registerStaticSpaFallback({ get } as never, tempDir);

    const handler = get.mock.calls[0]?.[1] as (
      req: ReturnType<typeof request>,
      res: { sendFile: (path: string, options: { root: string }) => void },
      next: () => void,
    ) => void;
    const sendFile = vi.fn();
    handler(request('/projects/project-1'), { sendFile }, vi.fn());

    expect(sendFile).toHaveBeenCalledWith('index.html', { root: tempDir });
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
