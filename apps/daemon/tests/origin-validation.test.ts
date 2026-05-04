// @ts-nocheck
import http from 'node:http';
import express from 'express';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  isLocalSameOrigin,
  readAllowedOriginHostsEnv,
  readAllowedOriginsEnv,
} from '../src/server.js';

/**
 * Replicate the origin validation middleware from server.ts exactly
 * as it appears in the real daemon, so we test the actual logic
 * including OD_WEB_PORT, Origin: null scoping, and non-loopback host.
 */
function createOriginMiddleware(resolvedPort, host = '127.0.0.1') {
  // Routes that serve content to sandboxed iframes (Origin: null) for
  // read-only purposes.
  const _NULL_ORIGIN_SAFE_GET_RE =
    /^\/projects\/[^/]+\/raw\/|^\/codex-pets\/[^/]+\/spritesheet$/;
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin == null || origin === '') return next();
    if (origin === 'null') {
      const isSafeReadOnly =
        req.method === 'GET' && _NULL_ORIGIN_SAFE_GET_RE.test(req.path);
      if (!isSafeReadOnly) {
        return res.status(403).json({ error: 'Origin: null not allowed for this route' });
      }
      return next();
    }
    if (!resolvedPort) {
      return res.status(403).json({ error: 'Server initializing' });
    }
    const ports = [resolvedPort];
    const webPort = Number(process.env.OD_WEB_PORT);
    if (webPort && webPort !== resolvedPort) ports.push(webPort);
    const schemes = ['http', 'https'];
    const loopbackHosts = ['127.0.0.1', 'localhost', '[::1]'];
    const allowedOrigins = new Set(
      [
        ...ports.flatMap((p) => [
          ...schemes.flatMap((s) => loopbackHosts.map((h) => `${s}://${h}:${p}`)),
          ...schemes.map((s) => `${s}://${host}:${p}`),
        ]),
        ...readAllowedOriginsEnv(),
      ],
    );
    if (!allowedOrigins.has(String(origin))) {
      return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
    }
    next();
  };
}

function makeTestApp(port, host = '127.0.0.1') {
  const app = express();
  app.use(express.json());
  app.use('/api', createOriginMiddleware(port, host));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/projects', (_req, res) => res.json({ projects: [] }));
  app.get('/api/projects/:id/raw/:name', (req, res) => {
    // Mimics the real raw-file route that sets CORS for Origin: null
    if (req.headers.origin === 'null') {
      res.header('Access-Control-Allow-Origin', '*');
    }
    res.json({ file: req.params.name });
  });
  app.post('/api/projects', (req, res) => res.json({ project: req.body }));
  app.delete('/api/projects/:id', (req, res) => res.json({ ok: true }));
  app.get('/api/codex-pets/:id/spritesheet', (req, res) => {
    // Mimics the real spritesheet route that sets CORS for Origin: null
    if (req.headers.origin === 'null') {
      res.header('Access-Control-Allow-Origin', 'null');
    }
    res.type('image/png').send(Buffer.from('fake-sprite'));
  });
  return app;
}

function request(port, method, path, { origin, headers = {} } = {}) {
  return new Promise((resolve) => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        ...headers,
        ...(origin !== undefined ? { origin } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.end();
  });
}

describe('daemon origin validation middleware', () => {
  let server;
  let port;

  beforeAll(
    () =>
      new Promise((resolve) => {
        // Start on port 0 to get a dynamic port, then rebuild with real port
        const tempApp = makeTestApp(0);
        const tempServer = tempApp.listen(0, '127.0.0.1', () => {
          port = tempServer.address().port;
          tempServer.close(() => {
            const realApp = makeTestApp(port);
            server = realApp.listen(port, '127.0.0.1', () => resolve());
          });
        });
      }),
  );

  afterAll(
    () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  );

  // --- Non-browser clients (no Origin) ---

  it('allows requests without Origin header (curl, CLI)', async () => {
    const res = await request(port, 'GET', '/api/health');
    expect(res.status).toBe(200);
  });

  // --- Same-origin (localhost) ---

  it('allows same-origin requests from http://127.0.0.1', async () => {
    const res = await request(port, 'GET', '/api/projects', {
      origin: `http://127.0.0.1:${port}`,
    });
    expect(res.status).toBe(200);
  });

  it('allows same-origin requests from http://localhost', async () => {
    const res = await request(port, 'GET', '/api/projects', {
      origin: `http://localhost:${port}`,
    });
    expect(res.status).toBe(200);
  });

  it('allows same-origin requests via HTTPS', async () => {
    const res = await request(port, 'GET', '/api/projects', {
      origin: `https://127.0.0.1:${port}`,
    });
    expect(res.status).toBe(200);
  });

  // --- Origin: null (sandboxed iframe previews) ---

  it('allows Origin: null for GET raw-file preview routes', async () => {
    const res = await request(port, 'GET', '/api/projects/abc/raw/design.html', {
      origin: 'null',
    });
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('allows Origin: null for GET codex-pet spritesheet routes', async () => {
    const res = await request(port, 'GET', '/api/codex-pets/my-pet/spritesheet', {
      origin: 'null',
    });
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('null');
  });

  it('rejects Origin: null on POST to state-changing endpoints', async () => {
    const res = await request(port, 'POST', '/api/projects', {
      origin: 'null',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body)).toEqual({ error: 'Origin: null not allowed for this route' });
  });

  it('rejects Origin: null on DELETE endpoints', async () => {
    const res = await request(port, 'DELETE', '/api/projects/abc', {
      origin: 'null',
    });
    expect(res.status).toBe(403);
  });

  it('rejects Origin: null on non-raw-file GET routes', async () => {
    const res = await request(port, 'GET', '/api/projects', {
      origin: 'null',
    });
    expect(res.status).toBe(403);
  });

  // --- Cross-origin rejection ---

  it('blocks cross-origin requests from external domains', async () => {
    const res = await request(port, 'GET', '/api/projects', {
      origin: 'http://evil.com',
    });
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body)).toEqual({ error: 'Cross-origin requests are not allowed' });
  });

  it('blocks cross-origin requests from other local ports', async () => {
    const res = await request(port, 'GET', '/api/projects', {
      origin: `http://127.0.0.1:9999`,
    });
    expect(res.status).toBe(403);
  });

  it('blocks cross-origin POST to state-changing endpoints', async () => {
    const res = await request(port, 'POST', '/api/projects', {
      origin: 'http://attacker.local',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(403);
  });

  // --- OD_WEB_PORT (split-port proxy) ---

  it('allows requests from OD_WEB_PORT (web proxy port)', async () => {
    const webPort = port + 1000;
    process.env.OD_WEB_PORT = String(webPort);
    const res = await request(port, 'GET', '/api/projects', {
      origin: `http://127.0.0.1:${webPort}`,
    });
    delete process.env.OD_WEB_PORT;
    expect(res.status).toBe(200);
  });

  it('blocks requests from unknown ports even with OD_WEB_PORT set', async () => {
    const webPort = port + 1000;
    process.env.OD_WEB_PORT = String(webPort);
    const res = await request(port, 'GET', '/api/projects', {
      origin: `http://127.0.0.1:${port + 2000}`,
    });
    delete process.env.OD_WEB_PORT;
    expect(res.status).toBe(403);
  });

  // Note: fail-closed coverage when port=0 is tested in the dedicated
  // describe block below ("fail-closed before port resolution").
});

describe('OD_ALLOWED_ORIGINS parsing', () => {
  let originalAllowedOrigins;
  let warnSpy;

  beforeEach(() => {
    originalAllowedOrigins = process.env.OD_ALLOWED_ORIGINS;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalAllowedOrigins === undefined) {
      delete process.env.OD_ALLOWED_ORIGINS;
    } else {
      process.env.OD_ALLOWED_ORIGINS = originalAllowedOrigins;
    }
    warnSpy.mockRestore();
  });

  it('normalizes http and https origins, default ports, whitespace, and duplicates', () => {
    process.env.OD_ALLOWED_ORIGINS =
      ' https://proxy.example.com , http://proxy.example.com:80, https://proxy.example.com:443, https://proxy.example.com ';

    expect(readAllowedOriginsEnv()).toEqual([
      'https://proxy.example.com',
      'http://proxy.example.com',
    ]);
    expect(readAllowedOriginHostsEnv()).toEqual(['proxy.example.com']);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed entries, unsupported schemes, credentials, paths, query strings, and fragments', () => {
    process.env.OD_ALLOWED_ORIGINS = [
      'not-a-url',
      'ftp://proxy.example.com',
      'https://user:pass@proxy.example.com',
      'https://proxy.example.com/app',
      'https://proxy.example.com?debug=1',
      'https://proxy.example.com#section',
      'https://ok.example.com/',
    ].join(',');

    expect(readAllowedOriginsEnv()).toEqual(['https://ok.example.com']);
    expect(warnSpy).toHaveBeenCalledTimes(6);
  });

  it('caches parse warnings until the raw env value changes', () => {
    process.env.OD_ALLOWED_ORIGINS = 'https://proxy.example.com/app';

    expect(readAllowedOriginsEnv()).toEqual([]);
    expect(readAllowedOriginsEnv()).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    process.env.OD_ALLOWED_ORIGINS = 'https://proxy.example.com?x=1';
    expect(readAllowedOriginsEnv()).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});

describe('OD_ALLOWED_ORIGINS request validation', () => {
  let server;
  let port;
  let originalAllowedOrigins;

  beforeAll(
    () =>
      new Promise((resolve) => {
        const tempApp = makeTestApp(0);
        const tempServer = tempApp.listen(0, '127.0.0.1', () => {
          port = tempServer.address().port;
          tempServer.close(() => {
            const realApp = makeTestApp(port);
            server = realApp.listen(port, '127.0.0.1', () => resolve());
          });
        });
      }),
  );

  beforeEach(() => {
    originalAllowedOrigins = process.env.OD_ALLOWED_ORIGINS;
  });

  afterEach(() => {
    if (originalAllowedOrigins === undefined) {
      delete process.env.OD_ALLOWED_ORIGINS;
    } else {
      process.env.OD_ALLOWED_ORIGINS = originalAllowedOrigins;
    }
  });

  afterAll(
    () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  );

  it('allows browser requests from explicitly trusted origins', async () => {
    process.env.OD_ALLOWED_ORIGINS = 'https://proxy.example.com';

    const res = await request(port, 'POST', '/api/projects', {
      origin: 'https://proxy.example.com',
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(200);
  });

  it('includes trusted origin hosts in stricter same-origin checks', () => {
    process.env.OD_ALLOWED_ORIGINS = 'https://proxy.example.com';

    expect(
      isLocalSameOrigin(
        {
          headers: {
            host: 'proxy.example.com',
            origin: 'https://proxy.example.com',
          },
        },
        port,
      ),
    ).toBe(true);
  });

  it('rejects configured origin hosts when the browser Origin does not match', () => {
    process.env.OD_ALLOWED_ORIGINS = 'https://proxy.example.com';

    expect(
      isLocalSameOrigin(
        {
          headers: {
            host: 'proxy.example.com',
            origin: 'https://evil.example.com',
          },
        },
        port,
      ),
    ).toBe(false);
  });
});

describe('origin validation: fail-closed before port resolution', () => {
  let server;
  let port;

  beforeAll(
    () =>
      new Promise((resolve) => {
        const app = makeTestApp(0); // port=0 → not resolved
        server = app.listen(0, '127.0.0.1', () => {
          port = server.address().port;
          resolve();
        });
      }),
  );

  afterAll(
    () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  );

  it('blocks browser origins when port is not resolved (fail-closed)', async () => {
    const res = await request(port, 'GET', '/api/projects', {
      origin: `http://127.0.0.1:${port}`,
    });
    expect(res.status).toBe(403);
  });

  it('still allows non-browser clients when port is not resolved', async () => {
    const res = await request(port, 'GET', '/api/health');
    expect(res.status).toBe(200);
  });
});

describe('origin validation: non-loopback bind host', () => {
  let server;
  let port;
  const nonLoopbackHost = '100.64.1.2'; // Tailscale-like address

  beforeAll(
    () =>
      new Promise((resolve) => {
        // Start on port 0 to get a dynamic port, then rebuild with real port
        const tempApp = makeTestApp(0, nonLoopbackHost);
        const tempServer = tempApp.listen(0, '127.0.0.1', () => {
          port = tempServer.address().port;
          tempServer.close(() => {
            const realApp = makeTestApp(port, nonLoopbackHost);
            server = realApp.listen(port, '127.0.0.1', () => resolve());
          });
        });
      }),
  );

  afterAll(
    () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  );

  it('allows browser requests from the non-loopback bind host', async () => {
    const res = await request(port, 'GET', '/api/projects', {
      origin: `http://${nonLoopbackHost}:${port}`,
    });
    expect(res.status).toBe(200);
  });

  it('still allows localhost origins alongside non-loopback host', async () => {
    const res = await request(port, 'GET', '/api/projects', {
      origin: `http://127.0.0.1:${port}`,
    });
    expect(res.status).toBe(200);
  });

  it('blocks unknown external origins even with non-loopback host', async () => {
    const res = await request(port, 'GET', '/api/projects', {
      origin: `http://evil.com:${port}`,
    });
    expect(res.status).toBe(403);
  });
});
