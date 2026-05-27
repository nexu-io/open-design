import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Regression test: the SPA catch-all fallback must not swallow GET /mcp.
 *
 * In a packaged/build runtime where STATIC_DIR/index.html exists, the daemon
 * registers a middleware fallback that returns index.html for any non-/api,
 * non-/mcp GET path.
 */

/** Builds a test app replicating the current server.ts SPA fallback pattern. */
function makeTestApp(opts: { excludeMcp: boolean; staticDir: string }) {
  const app = express();
  const staticDir = path.resolve(opts.staticDir);

  // ── Replicates the SPA fallback block from server.ts ──
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    const indexHtml = path.join(staticDir, 'index.html');
    if (fs.existsSync(indexHtml)) {
      const htmlContent = fs.readFileSync(indexHtml, 'utf-8');
      app.use((req, res, next) => {
        if (req.method !== 'GET') return next();
        if (req.path.startsWith('/api')) return next();
        if (opts.excludeMcp && req.path.startsWith('/mcp')) return next();
        res.type('html').send(htmlContent);
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
        tmpDir = path.join(import.meta.dirname, '.tmp-spa-fallback-test');
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html><body>SPA shell</body></html>');

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
