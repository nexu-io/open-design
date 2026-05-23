import fs from 'node:fs';
import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Regression test: the SPA catch-all fallback must not swallow GET /mcp.
 *
 * In a packaged/build runtime where STATIC_DIR/index.html exists, Express
 * registers a wildcard `app.get('*', …)` that returns index.html for any
 * non-/api path.  The MCP streamable-HTTP endpoint `GET /mcp` is registered
 * later, so without an explicit exclusion the wildcard matches first.
 */

/** Builds a test app replicating the current server.ts SPA fallback pattern. */
function makeTestApp(opts: { excludeMcp: boolean; staticDir: string }) {
  const app = express();

  // ── Replicates the SPA fallback block from server.ts ──
  if (fs.existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir));
    const indexHtml = `${opts.staticDir}/index.html`;
    if (fs.existsSync(indexHtml)) {
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        // This is the fix — omit it to reproduce the bug.
        if (opts.excludeMcp && req.path.startsWith('/mcp')) return next();
        res.sendFile(indexHtml);
      });
    }
  }

  // ── MCP handler (registered after the fallback, as in server.ts) ──
  app.get('/mcp', (_req, res) => {
    res.json({ ok: true, endpoint: 'mcp' });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe('SPA fallback does not intercept MCP routes', () => {
  let server: http.Server;
  let baseUrl: string;
  let tmpDir: string;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        tmpDir = `${import.meta.dirname}/.tmp-spa-fallback-test`;
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(`${tmpDir}/index.html`, '<html><body>SPA shell</body></html>');

        const app = makeTestApp({ excludeMcp: true, staticDir: tmpDir });
        server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      }),
  );

  afterAll(() => {
    server?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /mcp reaches the MCP handler, not the SPA fallback', async () => {
    const res = await fetch(`${baseUrl}/mcp`);
    expect(res.ok).toBe(true);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toContain('application/json');
    const body = await res.json();
    expect(body).toEqual({ ok: true, endpoint: 'mcp' });
  });

  it('GET /unknown-path returns the SPA shell (catch-all still works)', async () => {
    const res = await fetch(`${baseUrl}/some-unknown-page`);
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toContain('SPA shell');
  });

  it('GET /api/health is unaffected', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});

/** Separate describe proving the bug manifests without the /mcp exclusion. */
describe('without /mcp exclusion the SPA fallback swallows GET /mcp (regression proof)', () => {
  let server: http.Server;
  let baseUrl: string;
  let tmpDir: string;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        tmpDir = `${import.meta.dirname}/.tmp-spa-fallback-bug`;
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(`${tmpDir}/index.html`, '<html><body>SPA shell</body></html>');

        const app = makeTestApp({ excludeMcp: false, staticDir: tmpDir });
        server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      }),
  );

  afterAll(() => {
    server?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /mcp returns HTML instead of JSON (the bug)', async () => {
    const res = await fetch(`${baseUrl}/mcp`);
    // Without the fix, the wildcard returns index.html (200 + text/html).
    expect(res.ok).toBe(true);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toContain('text/html');
  });
});
