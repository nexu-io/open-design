import type http from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  isDesktopAuthGateActive,
  resetDesktopAuthForTests,
  setDesktopAuthSecret,
  signDesktopImportToken,
  startServer,
  verifyDesktopImportToken,
} from '../src/server.js';

/**
 * PR #974 — desktop-import-token gate. The HTTP /api/import/folder
 * route only accepts requests when either (a) no desktop auth secret
 * has been registered (web mode, gate dormant) or (b) a request
 * carries a valid HMAC-signed `X-OD-Desktop-Import-Token` minted by
 * the registered secret with the requested baseDir. These tests pin
 * each branch independently of the rest of the daemon.
 */
describe('desktop-import-token gate', () => {
  let server: http.Server;
  let baseUrl: string;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  beforeEach(() => {
    // Each test starts in "no secret registered" mode unless it
    // explicitly registers one — keeps tests independent.
    resetDesktopAuthForTests();
  });

  afterEach(() => {
    resetDesktopAuthForTests();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // Belt-and-suspenders: clear desktop secret before any other
    // test file boots a fresh daemon. The HTTP server module is
    // shared across vitest test files in the same pool, so a
    // lingering secret would silently 403 every other suite's
    // /api/import/folder call (#974).
    resetDesktopAuthForTests();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function makeFolder(): string {
    const d = mkdtempSync(path.join(tmpdir(), 'od-import-token-'));
    tempDirs.push(d);
    return d;
  }

  async function importFolder(body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  it('accepts unauthenticated imports when no secret is registered (web mode)', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '');
    const resp = await importFolder({ baseDir: folder });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { project: { metadata?: { fromTrustedPicker?: boolean } } };
    // PR #974: no secret registered → no `fromTrustedPicker` marker.
    expect(body.project.metadata?.fromTrustedPicker).toBeUndefined();
  });

  it('rejects imports with no token when a secret is registered', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '');
    setDesktopAuthSecret(randomBytes(32));
    const resp = await importFolder({ baseDir: folder });
    expect(resp.status).toBe(403);
    const body = (await resp.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('rejects imports with a malformed token', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '');
    setDesktopAuthSecret(randomBytes(32));
    const resp = await importFolder(
      { baseDir: folder },
      { 'x-od-desktop-import-token': 'totally.bogus' },
    );
    expect(resp.status).toBe(403);
  });

  it('rejects tokens minted with the wrong secret', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '');
    const goodSecret = randomBytes(32);
    const wrongSecret = randomBytes(32);
    setDesktopAuthSecret(goodSecret);
    const exp = new Date(Date.now() + 30_000).toISOString();
    const token = signDesktopImportToken(wrongSecret, folder, { nonce: 'n', exp });
    const resp = await importFolder(
      { baseDir: folder },
      { 'x-od-desktop-import-token': token },
    );
    expect(resp.status).toBe(403);
  });

  it('rejects tokens whose baseDir does not match the request body', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '');
    const secret = randomBytes(32);
    setDesktopAuthSecret(secret);
    const exp = new Date(Date.now() + 30_000).toISOString();
    const token = signDesktopImportToken(secret, '/some/other/path', { nonce: 'n', exp });
    const resp = await importFolder(
      { baseDir: folder },
      { 'x-od-desktop-import-token': token },
    );
    expect(resp.status).toBe(403);
  });

  it('rejects tokens whose expiry is in the past', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '');
    const secret = randomBytes(32);
    setDesktopAuthSecret(secret);
    const exp = new Date(Date.now() - 1_000).toISOString();
    const token = signDesktopImportToken(secret, folder, { nonce: 'n', exp });
    const resp = await importFolder(
      { baseDir: folder },
      { 'x-od-desktop-import-token': token },
    );
    expect(resp.status).toBe(403);
  });

  it('rejects tokens whose expiry exceeds the permitted window', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '');
    const secret = randomBytes(32);
    setDesktopAuthSecret(secret);
    // The daemon caps the permitted exp window at 2× TTL (TTL is 60s);
    // 30 minutes from now is way beyond that, even though the
    // signature itself would be valid.
    const exp = new Date(Date.now() + 30 * 60_000).toISOString();
    const token = signDesktopImportToken(secret, folder, { nonce: 'n', exp });
    const resp = await importFolder(
      { baseDir: folder },
      { 'x-od-desktop-import-token': token },
    );
    expect(resp.status).toBe(403);
  });

  it('accepts a valid token, marks the project trusted, and rejects nonce replays', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '');
    const secret = randomBytes(32);
    setDesktopAuthSecret(secret);
    const exp = new Date(Date.now() + 30_000).toISOString();
    const nonce = 'replay-test-nonce';
    const token = signDesktopImportToken(secret, folder, { nonce, exp });
    const okResp = await importFolder(
      { baseDir: folder },
      { 'x-od-desktop-import-token': token },
    );
    expect(okResp.status).toBe(200);
    const okBody = (await okResp.json()) as {
      project: { metadata?: { fromTrustedPicker?: boolean; baseDir?: string } };
    };
    // PR #974: trusted-flow imports get the explicit marker so the
    // desktop main process's openPath handler can refuse legacy
    // (untagged) folder-imports defensively.
    expect(okBody.project.metadata?.fromTrustedPicker).toBe(true);
    expect(okBody.project.metadata?.baseDir).toBeTruthy();

    // Replay: same nonce, same secret, same path — the daemon must
    // reject because the nonce is already in the consumed set.
    const replayResp = await importFolder(
      { baseDir: folder },
      { 'x-od-desktop-import-token': token },
    );
    expect(replayResp.status).toBe(403);
  });

  // Round-7 (lefarcen P2 @ server.ts:2998): PATCH /api/projects/:id used
  // to reject any metadata containing `fromTrustedPicker`, including the
  // unchanged `true` marker that the linked-folder UI re-spreads when
  // editing `linkedDirs`. Trusted imports must be able to PATCH other
  // metadata fields without 400-ing on their own marker.
  it('allows PATCH preserving the existing fromTrustedPicker:true marker', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '');
    const secret = randomBytes(32);
    setDesktopAuthSecret(secret);
    const exp = new Date(Date.now() + 30_000).toISOString();
    const token = signDesktopImportToken(secret, folder, { nonce: 'round7-patch-allow', exp });
    const importResp = await importFolder(
      { baseDir: folder },
      { 'x-od-desktop-import-token': token },
    );
    expect(importResp.status).toBe(200);
    const importBody = (await importResp.json()) as {
      project: { id: string; metadata?: { fromTrustedPicker?: boolean; kind?: string } };
    };
    const projectId = importBody.project.id;
    expect(importBody.project.metadata?.fromTrustedPicker).toBe(true);

    // Re-spread the existing metadata exactly the way the linked-folder
    // UI does — fromTrustedPicker:true is included unchanged.
    const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: {
          ...importBody.project.metadata,
          linkedDirs: [folder],
        },
      }),
    });
    expect(patchResp.status).toBe(200);
    const patchBody = (await patchResp.json()) as {
      project: { metadata?: { fromTrustedPicker?: boolean; linkedDirs?: string[] } };
    };
    expect(patchBody.project.metadata?.fromTrustedPicker).toBe(true);
    expect(patchBody.project.metadata?.linkedDirs).toEqual([folder]);
  });

  it('rejects PATCH that flips fromTrustedPicker on a trusted project', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '');
    const secret = randomBytes(32);
    setDesktopAuthSecret(secret);
    const exp = new Date(Date.now() + 30_000).toISOString();
    const token = signDesktopImportToken(secret, folder, { nonce: 'round7-patch-flip', exp });
    const importResp = await importFolder(
      { baseDir: folder },
      { 'x-od-desktop-import-token': token },
    );
    expect(importResp.status).toBe(200);
    const importBody = (await importResp.json()) as { project: { id: string } };
    const projectId = importBody.project.id;

    // The schema only permits `true | undefined`, but a malicious or
    // confused client could submit `false`. The handler must still
    // reject because the persisted value (`true`) differs from the
    // incoming value (`false`).
    const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: { kind: 'prototype', fromTrustedPicker: false as unknown as true },
      }),
    });
    expect(patchResp.status).toBe(400);
    const body = (await patchResp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/fromTrustedPicker/i);
  });

  // Round-4 (lefarcen P1): the gate must NOT fail open when the secret
  // is cleared after a desktop has registered. The sticky flag keeps
  // the gate active for the lifetime of the daemon process even if the
  // secret bytes are forgotten (production never clears the secret;
  // tests do).
  it('stays fail-closed (503 DESKTOP_AUTH_PENDING) after a registered secret is cleared', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '');
    setDesktopAuthSecret(randomBytes(32));
    expect(isDesktopAuthGateActive()).toBe(true);
    setDesktopAuthSecret(null);
    // Sticky: even with a null secret, the gate stays active because a
    // desktop has paired with this daemon process at least once.
    expect(isDesktopAuthGateActive()).toBe(true);
    const resp = await importFolder({ baseDir: folder });
    expect(resp.status).toBe(503);
    const body = (await resp.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('DESKTOP_AUTH_PENDING');
  });

  // Round-5 (lefarcen P3): HMAC binding ↔ imported path divergence.
  // The desktop now trims the picker output ONCE before signing AND
  // before POSTing, so the daemon-verified string, the request body,
  // and the realpath() input are all the SAME canonical string. A
  // padded path that the desktop trims to a real folder must succeed
  // end-to-end: HMAC verifies, realpath resolves, project is created
  // with metadata.baseDir equal to the realpath of the trimmed input.
  it('binds HMAC to the same trimmed string the desktop POSTs and the daemon imports', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '');
    const secret = randomBytes(32);
    setDesktopAuthSecret(secret);
    const exp = new Date(Date.now() + 30_000).toISOString();
    const nonce = 'round5-binding-nonce';
    // Mirror the desktop side: trim the (hypothetically) padded picker
    // output, then both sign and POST the trimmed string.
    const padded = `   ${folder}   `;
    const trimmed = padded.trim();
    const token = signDesktopImportToken(secret, trimmed, { nonce, exp });
    const resp = await importFolder(
      { baseDir: trimmed },
      { 'x-od-desktop-import-token': token },
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      project: { metadata?: { baseDir?: string; fromTrustedPicker?: boolean } };
    };
    expect(body.project.metadata?.fromTrustedPicker).toBe(true);
    // Daemon realpath()s the trimmed input, so metadata.baseDir is
    // the canonical realpath of the trimmed string — never the padded
    // version, never a divergent canonicalization step.
    expect(body.project.metadata?.baseDir).toBe(await realpath(trimmed));
  });

  // Round-5 (lefarcen P3) — defensive: a request whose body baseDir is
  // un-trimmed but whose token was signed against the trimmed value
  // must be rejected as a 403 token-mismatch, NOT silently coerced.
  // This pins the "no daemon-side re-trim before HMAC verify" contract.
  it('rejects 403 when desktop signed the trimmed string but POSTed the padded one', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '');
    const secret = randomBytes(32);
    setDesktopAuthSecret(secret);
    const exp = new Date(Date.now() + 30_000).toISOString();
    const nonce = 'round5-mismatch-nonce';
    const trimmed = folder;
    const padded = `${folder}   `;
    const token = signDesktopImportToken(secret, trimmed, { nonce, exp });
    const resp = await importFolder(
      { baseDir: padded },
      { 'x-od-desktop-import-token': token },
    );
    expect(resp.status).toBe(403);
  });
});

describe('verifyDesktopImportToken (pure helper)', () => {
  // Pure-function tests of the daemon-side verifier. The HTTP gate
  // wraps these branches but we pin the verifier directly so token-
  // shape regressions surface even when no Express stack is around.
  const SECRET = randomBytes(32);
  const NOW = Date.parse('2026-05-08T20:00:00.000Z');
  const VALID_EXP = '2026-05-08T20:00:30.000Z';

  function mint(baseDir: string, nonce: string, exp: string): string {
    const sig = createHmac('sha256', SECRET).update(`${baseDir}\n${nonce}\n${exp}`).digest('base64url');
    // `~` field separator mirrors the daemon's
    // DESKTOP_IMPORT_TOKEN_FIELD_SEP — ISO 8601 expiries embed `.` so
    // a `.` separator would split into four parts on parse.
    return [nonce, exp, sig].join('~');
  }

  it('accepts a freshly minted token bound to the same baseDir', () => {
    const consumed = new Map<string, number>();
    const result = verifyDesktopImportToken(
      SECRET,
      '/Users/u/proj',
      mint('/Users/u/proj', 'nonce1', VALID_EXP),
      NOW,
      consumed,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects mismatched baseDir', () => {
    const consumed = new Map<string, number>();
    const result = verifyDesktopImportToken(
      SECRET,
      '/Users/u/other',
      mint('/Users/u/proj', 'nonce2', VALID_EXP),
      NOW,
      consumed,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/signature/i);
  });

  it('rejects malformed tokens', () => {
    const consumed = new Map<string, number>();
    expect(verifyDesktopImportToken(SECRET, '/p', '', NOW, consumed).ok).toBe(false);
    expect(verifyDesktopImportToken(SECRET, '/p', 'a.b', NOW, consumed).ok).toBe(false);
    expect(verifyDesktopImportToken(SECRET, '/p', 'a..c', NOW, consumed).ok).toBe(false);
  });

  it('rejects expired tokens', () => {
    const consumed = new Map<string, number>();
    const result = verifyDesktopImportToken(
      SECRET,
      '/p',
      mint('/p', 'nonce3', VALID_EXP),
      NOW + 60_000,
      consumed,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/expired/i);
  });

  it('rejects nonces that are already in the consumed set', () => {
    const consumed = new Map<string, number>([['nonce4', NOW + 60_000]]);
    const result = verifyDesktopImportToken(
      SECRET,
      '/p',
      mint('/p', 'nonce4', VALID_EXP),
      NOW,
      consumed,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/nonce/i);
  });

  it('rejects expiries that exceed the permitted window', () => {
    const consumed = new Map<string, number>();
    const farExp = '2026-05-08T20:30:00.000Z';
    const result = verifyDesktopImportToken(
      SECRET,
      '/p',
      mint('/p', 'nonce5', farExp),
      NOW,
      consumed,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/window/i);
  });
});
