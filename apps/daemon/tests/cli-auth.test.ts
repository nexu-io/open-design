// Behavior contract for the `od auth` subcommand (dual-track surface for the
// web AuthAccountMenu). better-auth is cookie/session based, so the CLI must:
//   - sign-in / sign-up: capture the Set-Cookie session token and persist it
//   - status: replay the stored cookie and report the signed-in user
//   - sign-out: POST with the cookie, then clear the stored file
//   - report a distinct `auth-not-enabled` error when /api/auth is unmounted
//     (daemon started without OPEN_DESIGN_DATABASE_URL → 404)
//
// Postgres isn't available in unit tests, so we stub better-auth's HTTP
// surface and exec the real cli.ts. Stub-server + exec-the-real-cli pattern
// follows cli-files-write.test.ts.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const REPO_ROOT = pathResolve(__dirname, '../../..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

const SESSION_COOKIE = 'better-auth.session_token';
const SESSION_VALUE = 'tok-abc123.sig';

interface CapturedRequest {
  method: string;
  url: string;
  cookie: string | undefined;
  origin: string | undefined;
  body: string;
}

interface StubServer {
  baseUrl: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

/** Stub of better-auth's email/password surface. When `enabled` is false it
 *  404s every /api/auth route, mimicking a daemon with auth unmounted. */
async function startStubServer(enabled = true, cookieName = SESSION_COOKIE): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const url = req.url ?? '';
      const cookie = req.headers.cookie;
      requests.push({ method: req.method ?? '', url, cookie, origin: req.headers.origin, body: raw });

      if (!enabled) {
        res.statusCode = 404;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      if (url.startsWith('/api/auth/sign-in/email') || url.startsWith('/api/auth/sign-up/email')) {
        const parsed = raw ? JSON.parse(raw) : {};
        res.statusCode = 200;
        res.setHeader('set-cookie', `${cookieName}=${SESSION_VALUE}; Path=/; HttpOnly; SameSite=Lax`);
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            token: SESSION_VALUE,
            user: { id: 'u_1', email: parsed.email, name: parsed.name ?? parsed.email },
          }),
        );
        return;
      }

      if (url.startsWith('/api/auth/get-session')) {
        const hasSession = (cookie ?? '').includes(`${cookieName}=${SESSION_VALUE}`);
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(
          hasSession
            ? JSON.stringify({ session: { id: 's_1' }, user: { id: 'u_1', email: 'a@b.co', name: 'Ada' } })
            : JSON.stringify({ session: null, user: null }),
        );
        return;
      }

      if (url.startsWith('/api/auth/sign-out')) {
        res.statusCode = 200;
        res.setHeader('set-cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0`);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ success: true }));
        return;
      }

      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('stub server has no address');
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    requests,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()));
      }),
  };
}

function runCli(
  args: string[],
  options: { stdin?: string; sessionFile: string },
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolveRun) => {
    const env: NodeJS.ProcessEnv = { ...process.env, OD_AUTH_SESSION_FILE: options.sessionFile };
    delete env.NODE_OPTIONS;
    const child = spawn(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
      cwd: DAEMON_ROOT,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 20_000,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => {
      stdout += c;
    });
    child.stderr.on('data', (c) => {
      stderr += c;
    });
    child.on('close', (code) => resolveRun({ stdout, stderr, code }));
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
}

describe('od auth', () => {
  let scratchDir: string;
  let sessionFile: string;

  beforeAll(() => {
    scratchDir = mkdtempSync(join(tmpdir(), 'od-auth-cli-'));
  });
  afterAll(() => {
    rmSync(scratchDir, { recursive: true, force: true });
  });
  afterEach(() => {
    rmSync(sessionFile, { force: true });
  });

  it('sign-in persists the session cookie, status replays it, sign-out clears it', async () => {
    const stub = await startStubServer(true);
    sessionFile = join(scratchDir, 'sess-flow');
    try {
      const signIn = await runCli(
        ['auth', 'sign-in', '--email', 'a@b.co', '--password', 'hunter2hunter', '--daemon-url', stub.baseUrl],
        { sessionFile },
      );
      expect(signIn.code).toBe(0);
      expect(signIn.stdout).toMatch(/Signed in as/);
      expect(existsSync(sessionFile)).toBe(true);
      expect(readFileSync(sessionFile, 'utf8')).toContain(`${SESSION_COOKIE}=${SESSION_VALUE}`);
      // The POST must carry an Origin matching the daemon base, or better-auth
      // rejects undici's `sec-fetch-mode: cors` request with 403 (real-DB bug).
      const signInReq = stub.requests.find((r) => r.url.startsWith('/api/auth/sign-in/email'));
      expect(signInReq?.origin).toBe(stub.baseUrl);

      const status = await runCli(['auth', 'status', '--json', '--daemon-url', stub.baseUrl], { sessionFile });
      expect(status.code).toBe(0);
      const parsed = JSON.parse(status.stdout);
      expect(parsed.signedIn).toBe(true);
      expect(parsed.user?.email).toBe('a@b.co');
      // The cookie must have been replayed on get-session.
      const sessionReq = stub.requests.find((r) => r.url.startsWith('/api/auth/get-session'));
      expect(sessionReq?.cookie).toContain(`${SESSION_COOKIE}=${SESSION_VALUE}`);

      const signOut = await runCli(['auth', 'sign-out', '--daemon-url', stub.baseUrl], { sessionFile });
      expect(signOut.code).toBe(0);
      expect(existsSync(sessionFile)).toBe(false);
    } finally {
      await stub.close();
    }
  });

  it('sign-up sends name and signs in', async () => {
    const stub = await startStubServer(true);
    sessionFile = join(scratchDir, 'sess-signup');
    try {
      const res = await runCli(
        ['auth', 'sign-up', '--email', 'c@d.co', '--password', 'longenough1', '--name', 'Cee', '--json', '--daemon-url', stub.baseUrl],
        { sessionFile },
      );
      expect(res.code).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.ok).toBe(true);
      expect(parsed.persisted).toBe(true);
      const signupReq = stub.requests.find((r) => r.url.startsWith('/api/auth/sign-up/email'));
      expect(JSON.parse(signupReq!.body)).toMatchObject({ email: 'c@d.co', name: 'Cee' });
    } finally {
      await stub.close();
    }
  });

  it('reads the password from stdin with --password-file -', async () => {
    const stub = await startStubServer(true);
    sessionFile = join(scratchDir, 'sess-stdin');
    try {
      const res = await runCli(
        ['auth', 'sign-in', '--email', 'a@b.co', '--password-file', '-', '--daemon-url', stub.baseUrl],
        { sessionFile, stdin: 'secretFromStdin\n' },
      );
      expect(res.code).toBe(0);
      const signinReq = stub.requests.find((r) => r.url.startsWith('/api/auth/sign-in/email'));
      // Trailing newline is stripped before sending.
      expect(JSON.parse(signinReq!.body).password).toBe('secretFromStdin');
    } finally {
      await stub.close();
    }
  });

  it('persists a __Secure- prefixed session cookie (HTTPS deploy)', async () => {
    // When the daemon runs with secure cookies, better-auth names the session
    // cookie `__Secure-better-auth.session_token`. The CLI must still capture
    // and replay it so status/sign-out keep working behind a TLS proxy.
    const stub = await startStubServer(true, `__Secure-${SESSION_COOKIE}`);
    sessionFile = join(scratchDir, 'sess-secure');
    try {
      const signIn = await runCli(
        ['auth', 'sign-in', '--email', 'a@b.co', '--password', 'hunter2hunter', '--daemon-url', stub.baseUrl],
        { sessionFile },
      );
      expect(signIn.code).toBe(0);
      expect(readFileSync(sessionFile, 'utf8')).toContain(`__Secure-${SESSION_COOKIE}=${SESSION_VALUE}`);

      const status = await runCli(['auth', 'status', '--json', '--daemon-url', stub.baseUrl], { sessionFile });
      expect(JSON.parse(status.stdout).signedIn).toBe(true);
      const sessionReq = stub.requests.find((r) => r.url.startsWith('/api/auth/get-session'));
      expect(sessionReq?.cookie).toContain(`__Secure-${SESSION_COOKIE}=${SESSION_VALUE}`);
    } finally {
      await stub.close();
    }
  });

  it('status with no stored session reports signed out', async () => {
    const stub = await startStubServer(true);
    sessionFile = join(scratchDir, 'sess-empty');
    try {
      const res = await runCli(['auth', 'status', '--daemon-url', stub.baseUrl], { sessionFile });
      expect(res.code).toBe(0);
      expect(res.stdout).toMatch(/Not signed in/);
    } finally {
      await stub.close();
    }
  });

  it('reports auth-not-enabled when /api/auth is unmounted (404)', async () => {
    const stub = await startStubServer(false);
    sessionFile = join(scratchDir, 'sess-disabled');
    try {
      const res = await runCli(['auth', 'status', '--json', '--daemon-url', stub.baseUrl], { sessionFile });
      expect(res.code).toBe(1);
      const parsed = JSON.parse(res.stderr.trim());
      expect(parsed.error?.code).toBe('auth-not-enabled');
    } finally {
      await stub.close();
    }
  });

  it('errors with usage when sign-in is missing credentials', async () => {
    sessionFile = join(scratchDir, 'sess-usage');
    const res = await runCli(['auth', 'sign-in', '--daemon-url', 'http://127.0.0.1:1'], { sessionFile });
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage: od auth sign-in/);
  });
});
