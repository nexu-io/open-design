import { randomBytes } from 'node:crypto';

import { getDesktopAuthSecret, signDesktopImportToken } from '../src/desktop-auth.js';

const REAL_FETCH_SYMBOL = Symbol.for('open-design.daemon.vitestRealFetch');

/**
 * issue #5480 — directory-binding routes (`/api/import/folder` and
 * `/api/projects/:id/working-dir`) now always require an HMAC import
 * token. Functional suites that POST a `baseDir` as setup can call
 * `installImportTokenAutoMint()` in `beforeAll` so requests get a token
 * minted from the ephemeral secret automatically, exercising the real
 * authenticated path without per-test plumbing.
 *
 * Suites that assert on the unauthenticated path (e.g.
 * `desktop-import-token-gate.test.ts`) must NOT install this shim.
 */
export function installImportTokenAutoMint(): void {
  const g = globalThis as typeof globalThis & {
    [REAL_FETCH_SYMBOL]?: typeof fetch;
  };
  if (g[REAL_FETCH_SYMBOL]) return; // already installed
  g[REAL_FETCH_SYMBOL] = globalThis.fetch;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const initObj: RequestInit = init ?? {};
    const headers = initObj.headers as Record<string, string> | undefined;
    if (
      !headers?.['x-od-desktop-import-token'] &&
      (url.includes('/api/import/folder') || url.includes('/working-dir'))
    ) {
      try {
        const body = typeof initObj.body === 'string' ? JSON.parse(initObj.body) : initObj.body;
        const baseDir = (body as { baseDir?: string } | undefined)?.baseDir;
        const secret = getDesktopAuthSecret();
        if (secret != null && typeof baseDir === 'string') {
          const now = Date.now();
          const nonce = randomBytes(16).toString('base64url');
          const exp = new Date(now + 50_000).toISOString();
          initObj.headers = {
            ...headers,
            'x-od-desktop-import-token': signDesktopImportToken(secret, baseDir, { nonce, exp }),
          };
        }
      } catch {
        // Leave headers untouched on parse/secret errors.
      }
    }
    return realFetch(input as Parameters<typeof fetch>[0], initObj);
    }) as typeof fetch;
}

export function uninstallImportTokenAutoMint(): void {
  const g = globalThis as typeof globalThis & {
    [REAL_FETCH_SYMBOL]?: typeof fetch;
  };
  const realFetch = g[REAL_FETCH_SYMBOL];
  if (realFetch) {
    globalThis.fetch = realFetch;
    delete g[REAL_FETCH_SYMBOL];
  }
}
