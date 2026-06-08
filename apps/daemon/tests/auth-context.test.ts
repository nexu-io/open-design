import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DEFAULT_TRUSTED_EMAIL_HEADER,
  createAuthContextMiddleware,
  normalizeDaemonEmail,
  type AuthenticatedRequest,
  type DaemonUser,
} from '../src/auth-context.js';

interface TestServer {
  url: string;
  close: () => Promise<void>;
}

interface WhoamiBody {
  user: DaemonUser | null;
}

interface AppOptions {
  multitenant?: boolean;
  devUser?: string;
  allowlist?: ReadonlySet<string>;
  baseDataDir?: string;
  headerName?: string;
  publicPaths?: readonly string[];
}

async function whoami(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: WhoamiBody }> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({ user: null }))) as WhoamiBody;
  return { status: res.status, body };
}

async function listen(app: express.Express): Promise<http.Server> {
  return new Promise<http.Server>((resolve, reject) => {
    const server = http.createServer(app);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

async function startApp(options: AppOptions = {}): Promise<TestServer> {
  const app = express();
  const cfg: Parameters<typeof createAuthContextMiddleware>[0] = {
    baseDataDir: options.baseDataDir ?? '/data',
  };
  if (options.multitenant !== undefined) cfg.multitenant = options.multitenant;
  if (options.devUser !== undefined) cfg.devUser = options.devUser;
  if (options.allowlist !== undefined) cfg.allowlist = options.allowlist;
  if (options.headerName !== undefined) cfg.headerName = options.headerName;
  if (options.publicPaths !== undefined) cfg.publicPaths = options.publicPaths;

  app.use(createAuthContextMiddleware(cfg));
  app.get('/whoami', (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    res.json(user ? { user } : { user: null });
  });
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  const server = await listen(app);
  const addr = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('normalizeDaemonEmail', () => {
  it('normalizes valid email-like identities', () => {
    expect(normalizeDaemonEmail('  Person@Example.COM  ')).toBe('person@example.com');
    expect(normalizeDaemonEmail('local@dev')).toBe('local@dev');
  });

  it('rejects malformed identities', () => {
    expect(normalizeDaemonEmail('not an email')).toBeNull();
    expect(normalizeDaemonEmail('missing-domain@')).toBeNull();
    expect(normalizeDaemonEmail('@missing-local')).toBeNull();
    expect(normalizeDaemonEmail('two@@example.com')).toBeNull();
  });
});

describe('auth-context middleware', () => {
  describe('single-tenant mode', () => {
    let srv: TestServer;

    beforeAll(async () => {
      srv = await startApp({ multitenant: false, devUser: 'local@dev', baseDataDir: '/data' });
    });

    afterAll(() => srv.close());

    it('attaches a dev-fallback user when the identity header is missing', async () => {
      const { status, body } = await whoami(`${srv.url}/whoami`);
      expect(status).toBe(200);
      expect(body.user?.email).toBe('local@dev');
      expect(body.user?.source).toBe('dev-fallback');
      expect(body.user?.dataDir).toBe('/data');
    });

    it('attaches a trusted-header user when the identity header is present', async () => {
      const { body } = await whoami(`${srv.url}/whoami`, {
        headers: { [DEFAULT_TRUSTED_EMAIL_HEADER]: 'Person@Example.com' },
      });
      expect(body.user?.email).toBe('person@example.com');
      expect(body.user?.source).toBe('trusted-header');
      expect(body.user?.dirHash).toMatch(/^[a-f0-9]{12}$/u);
      expect(body.user?.dataDir).toBe('/data');
    });

    it('treats a malformed identity header as missing', async () => {
      const { body } = await whoami(`${srv.url}/whoami`, {
        headers: { [DEFAULT_TRUSTED_EMAIL_HEADER]: 'not an email' },
      });
      expect(body.user?.email).toBe('local@dev');
      expect(body.user?.source).toBe('dev-fallback');
    });
  });

  describe('multitenant mode', () => {
    let srv: TestServer;

    beforeAll(async () => {
      srv = await startApp({ multitenant: true, baseDataDir: '/data' });
    });

    afterAll(() => srv.close());

    it('rejects with 401 when the identity header is missing', async () => {
      const { status } = await whoami(`${srv.url}/whoami`);
      expect(status).toBe(401);
    });

    it('attaches a per-user dataDir with a stable dirHash', async () => {
      const { body } = await whoami(`${srv.url}/whoami`, {
        headers: { [DEFAULT_TRUSTED_EMAIL_HEADER]: 'user@example.com' },
      });
      expect(body.user?.email).toBe('user@example.com');
      expect(body.user?.source).toBe('trusted-header');
      expect(body.user?.dirHash).toMatch(/^[a-f0-9]{12}$/u);
      expect(body.user?.dataDir).toBe(path.join('/data', 'users', body.user!.dirHash));
    });

    it('produces stable dirHash across requests for the same email', async () => {
      const headers = { [DEFAULT_TRUSTED_EMAIL_HEADER]: 'stable@example.com' };
      const a = await whoami(`${srv.url}/whoami`, { headers });
      const b = await whoami(`${srv.url}/whoami`, { headers });
      expect(a.body.user?.dirHash).toBe(b.body.user?.dirHash);
      expect(a.body.user?.dataDir).toBe(b.body.user?.dataDir);
    });

    it('produces different dirHash values for different emails', async () => {
      const a = await whoami(`${srv.url}/whoami`, {
        headers: { [DEFAULT_TRUSTED_EMAIL_HEADER]: 'a@example.com' },
      });
      const b = await whoami(`${srv.url}/whoami`, {
        headers: { [DEFAULT_TRUSTED_EMAIL_HEADER]: 'b@example.com' },
      });
      expect(a.body.user?.dirHash).not.toBe(b.body.user?.dirHash);
    });
  });

  describe('allowlist enforcement', () => {
    let srv: TestServer;

    beforeAll(async () => {
      srv = await startApp({
        multitenant: true,
        baseDataDir: '/data',
        allowlist: new Set(['Allowed@Example.com']),
      });
    });

    afterAll(() => srv.close());

    it('allows a listed email', async () => {
      const res = await fetch(`${srv.url}/whoami`, {
        headers: { [DEFAULT_TRUSTED_EMAIL_HEADER]: 'allowed@example.com' },
      });
      expect(res.status).toBe(200);
    });

    it('rejects an unlisted email with 403', async () => {
      const res = await fetch(`${srv.url}/whoami`, {
        headers: { [DEFAULT_TRUSTED_EMAIL_HEADER]: 'stranger@example.com' },
      });
      expect(res.status).toBe(403);
    });

    it('treats an explicit empty allowlist as deny-all', async () => {
      const srv = await startApp({
        multitenant: true,
        baseDataDir: '/data',
        allowlist: new Set(),
      });
      try {
        const res = await fetch(`${srv.url}/whoami`, {
          headers: { [DEFAULT_TRUSTED_EMAIL_HEADER]: 'anyone@example.com' },
        });
        expect(res.status).toBe(403);
      } finally {
        await srv.close();
      }
    });
  });

  describe('default allowlist file discovery', () => {
    let tmp: string;
    let srv: TestServer;

    beforeAll(async () => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-context-'));
      fs.mkdirSync(path.join(tmp, 'config'));
      fs.writeFileSync(
        path.join(tmp, 'config', 'allowlist.txt'),
        '# comment line\n\nfile-allowed@example.com\ninvalid identity\n',
      );

      const app = express();
      app.use(
        createAuthContextMiddleware({
          baseDataDir: '/data',
          multitenant: true,
          projectRoot: tmp,
        }),
      );
      app.get('/whoami', (req, res) => {
        const user = (req as AuthenticatedRequest).user;
        res.json(user ? { user } : { user: null });
      });
      const server = await listen(app);
      const addr = server.address() as { port: number };
      srv = {
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
      };
    });

    afterAll(async () => {
      await srv.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('reads allowlist.txt and enforces it', async () => {
      const ok = await fetch(`${srv.url}/whoami`, {
        headers: { [DEFAULT_TRUSTED_EMAIL_HEADER]: 'file-allowed@example.com' },
      });
      expect(ok.status).toBe(200);

      const denied = await fetch(`${srv.url}/whoami`, {
        headers: { [DEFAULT_TRUSTED_EMAIL_HEADER]: 'someone-else@example.com' },
      });
      expect(denied.status).toBe(403);
    });
  });

  describe('configuration helpers', () => {
    it('supports a custom trusted email header', async () => {
      const srv = await startApp({
        multitenant: true,
        baseDataDir: '/data',
        headerName: 'x-authenticated-email',
      });
      try {
        const { status, body } = await whoami(`${srv.url}/whoami`, {
          headers: { 'x-authenticated-email': 'custom@example.com' },
        });
        expect(status).toBe(200);
        expect(body.user?.email).toBe('custom@example.com');
      } finally {
        await srv.close();
      }
    });

    it('allows public paths to bypass multitenant auth', async () => {
      const srv = await startApp({
        multitenant: true,
        baseDataDir: '/data',
        publicPaths: ['/health'],
      });
      try {
        const health = await fetch(`${srv.url}/health`);
        expect(health.status).toBe(200);

        const protectedRoute = await fetch(`${srv.url}/whoami`);
        expect(protectedRoute.status).toBe(401);
      } finally {
        await srv.close();
      }
    });

    it('normalizes resolveUser input', () => {
      const middleware = createAuthContextMiddleware({
        baseDataDir: '/data',
        multitenant: true,
      });
      const user = middleware.resolveUser('Person@Example.COM');
      expect(user.email).toBe('person@example.com');
      expect(user.dirHash).toMatch(/^[a-f0-9]{12}$/u);
      expect(user.dataDir).toBe(path.join('/data', 'users', user.dirHash));
    });
  });
});
