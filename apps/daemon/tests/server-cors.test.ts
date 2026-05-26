import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Replicate only the CORS middleware pattern from the raw file route so we can
// test the header logic without spinning up the full daemon (database, fs, etc.).
function makeTestApp() {
  const app = express();

  app.options('/api/projects/:id/raw/*', (req, res) => {
    if (req.headers.origin === 'null') {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
    }
    res.sendStatus(204);
  });

  app.get('/api/projects/:id/raw/*', (req, res) => {
    if (req.headers.origin === 'null') {
      res.header('Access-Control-Allow-Origin', '*');
    }
    res.sendStatus(200);
  });

  return app;
}

describe('raw file endpoint CORS', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        server = makeTestApp().listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      }),
  );

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('sets Access-Control-Allow-Origin: * for null origin (srcdoc iframe)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/test-id/raw/components/login.jsx`, {
      headers: { Origin: 'null' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('does not set Access-Control-Allow-Origin for a real cross-origin site', async () => {
    const res = await fetch(`${baseUrl}/api/projects/test-id/raw/components/login.jsx`, {
      headers: { Origin: 'https://evil.com' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not set Access-Control-Allow-Origin for same-origin requests (no Origin header)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/test-id/raw/components/login.jsx`);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('handles OPTIONS preflight for null origin', async () => {
    const res = await fetch(`${baseUrl}/api/projects/test-id/raw/components/login.jsx`, {
      method: 'OPTIONS',
      headers: { Origin: 'null' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toBe('GET');
  });

  it('rejects OPTIONS preflight from a real cross-origin site', async () => {
    const res = await fetch(`${baseUrl}/api/projects/test-id/raw/components/login.jsx`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.com' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
