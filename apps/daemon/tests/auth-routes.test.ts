// Deploy-safety contract for the better-auth route registrar. The auth feature
// is opt-in: a daemon started WITHOUT OPEN_DESIGN_DATABASE_URL must not mount
// /api/auth, must not touch Postgres, and must not crash startup. The enabled
// path needs a real Postgres and is covered by the e2e flow, not here.

import express from 'express';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { registerAuthRoutes, createOpenDesignAuth } from '../src/routes/auth.js';

const NO_DB_ENV = {} as NodeJS.ProcessEnv;

describe('registerAuthRoutes (auth disabled path)', () => {
  const dirs: string[] = [];
  const dataDir = () => {
    const d = mkdtempSync(join(tmpdir(), 'od-authroute-'));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it('returns null and mounts no /api/auth handler when no database url is set', async () => {
    const app = express();
    const runtime = await registerAuthRoutes(app, { dataDir: dataDir(), env: NO_DB_ENV });
    expect(runtime).toBeNull();

    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address();
    const port = addr && typeof addr === 'object' ? addr.port : 0;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/get-session`);
      // Express returns 404 for an unmounted path — proves nothing was wired.
      expect(res.status).toBe(404);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('createOpenDesignAuth returns null without a database url (no Postgres contact)', async () => {
    const runtime = await createOpenDesignAuth({ dataDir: dataDir(), env: NO_DB_ENV });
    expect(runtime).toBeNull();
  });

  it('treats a blank OPEN_DESIGN_DATABASE_URL as disabled', async () => {
    const runtime = await createOpenDesignAuth({
      dataDir: dataDir(),
      env: { OPEN_DESIGN_DATABASE_URL: '   ' } as NodeJS.ProcessEnv,
    });
    expect(runtime).toBeNull();
  });
});
