// Tests for updateInstallMode pref — part of #4467 (PR1).
//
// Spec: apps/daemon/src/app-config.ts gains:
//   - `updateInstallMode?: 'automatic' | 'manual'` on AppConfigPrefs
//   - key added to ALLOWED_KEYS
//   - applyConfigValue validates the enum (accept 'automatic'/'manual'; reject anything else)
//   - absent/unset treated as 'automatic' (no migration needed)
//
// These tests are RED until the implementation lands.
//
// Additional tests added for #4467 (PR2) — CLI unset regression:
//   - Daemon-level null-clear guard (non-regression; likely green already)
//   - CLI `od config unset updateInstallMode` must send { updateInstallMode: null }
//     in the PUT body so the merge-style writeAppConfig actually clears the value.
//     The current code (delete next[key]) omits the key, leaving 'manual' stored.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path, { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readAppConfig, writeAppConfig } from '../src/app-config.js';

// ---------------------------------------------------------------------------
// Helpers shared by the CLI stub tests
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = dirname(__filename);
const REPO_ROOT = pathResolve(__dirnameLocal, '../../..');
const CLI_SRC = pathResolve(__dirnameLocal, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

interface CapturedRequest {
  method: string;
  url: string;
  body: string;
}

interface StubServer {
  baseUrl: string;
  requests: CapturedRequest[];
  /** Replace the response for the next matching call. */
  setNextGetResponse: (body: unknown) => void;
  close: () => Promise<void>;
}

/** Minimal HTTP stub that records every request body. The GET /api/app-config
 *  endpoint returns the most-recently set mock response (default: empty config).
 *  All other methods return 200 with an empty config. */
async function startConfigStubServer(): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
  let nextGetBody: unknown = { config: {} };

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
    });
    req.on('end', () => {
      requests.push({ method: req.method ?? '', url: req.url ?? '', body: raw });
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET') {
        res.end(JSON.stringify(nextGetBody));
      } else {
        // PUT — echo back the written config so the CLI can log it.
        let written: unknown = {};
        try { written = JSON.parse(raw); } catch { /* ignore */ }
        res.end(JSON.stringify({ config: written }));
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('stub server has no address');

  return {
    baseUrl: `http://127.0.0.1:${(addr as { port: number }).port}`,
    requests,
    setNextGetResponse: (body) => { nextGetBody = body; },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function runCli(
  args: string[],
  daemonUrl: string,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env, OD_DAEMON_URL: daemonUrl };
    delete env.NODE_OPTIONS;
    const child = spawn(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
      cwd: pathResolve(__dirnameLocal, '..'),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 20_000,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => { stdout += c.toString(); });
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
    child.on('close', (code) => resolve({ stdout, stderr, code }));
    child.stdin.end();
  });
}

describe('app-config updateInstallMode pref', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-update-install-mode-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("persists 'manual' and reads it back", async () => {
    await writeAppConfig(dataDir, { updateInstallMode: 'manual' });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.updateInstallMode).toBe('manual');
  });

  it("persists 'automatic' and reads it back", async () => {
    await writeAppConfig(dataDir, { updateInstallMode: 'automatic' });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.updateInstallMode).toBe('automatic');
  });

  it('rejects invalid enum values and drops them', async () => {
    // 'bogus' is not in the allowed enum; writeAppConfig must drop it.
    await writeAppConfig(dataDir, { updateInstallMode: 'bogus' as any });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.updateInstallMode).toBeUndefined();
  });

  it('treats absent field as automatic (no stored value, no crash)', async () => {
    // Fresh config with no updateInstallMode — should be absent (undefined),
    // which callers treat as 'automatic'.
    const cfg = await readAppConfig(dataDir);
    expect(cfg.updateInstallMode).toBeUndefined();
  });

  it("updateInstallMode is included in ALLOWED_KEYS (round-trip without unknown-key filter dropping it)", async () => {
    // ALLOWED_KEYS gate: only keys in the set survive writeAppConfig.
    // If updateInstallMode is missing from ALLOWED_KEYS it is silently
    // dropped — this test catches that regression.
    await writeAppConfig(dataDir, { updateInstallMode: 'manual', agentId: 'claude' });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.updateInstallMode).toBe('manual');
    expect(cfg.agentId).toBe('claude');
  });

  it("clears updateInstallMode when null is sent", async () => {
    await writeAppConfig(dataDir, { updateInstallMode: 'manual' });
    await writeAppConfig(dataDir, { updateInstallMode: null as any });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.updateInstallMode).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Daemon-level null-clear contract (non-regression guard for the fix)
//
// writeAppConfig(dir, { updateInstallMode: null }) must clear a previously-
// stored 'manual' value.  applyConfigValue already handles null → delete, so
// this should be GREEN on both the current code and after the fix.  It exists
// to document and protect the daemon-side contract the CLI fix relies on.
// ---------------------------------------------------------------------------
describe('app-config updateInstallMode null-clear (daemon-level guard)', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-uim-null-guard-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('clears a previously stored manual value when null is written via writeAppConfig', async () => {
    // Set 'manual' first.
    await writeAppConfig(dataDir, { updateInstallMode: 'manual' });
    const before = await readAppConfig(dataDir);
    expect(before.updateInstallMode).toBe('manual');

    // Send null — applyConfigValue must delete the key.
    await writeAppConfig(dataDir, { updateInstallMode: null as any });
    const after = await readAppConfig(dataDir);
    expect(after.updateInstallMode).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CLI `od config unset updateInstallMode` regression test (RED)
//
// The bug: the current unset path does `delete next[key]` then sends the
// object WITHOUT the key in the PUT body.  writeAppConfig's doWrite only
// iterates keys that are present in the partial — an absent key is a no-op,
// so 'manual' survives the unset.
//
// The fix contract: unset must send { updateInstallMode: null } so doWrite
// calls applyConfigValue(…, null) which deletes the stored value.
//
// We intercept at the HTTP layer (stub server) because:
//   1. No live daemon required — fast, no port conflicts.
//   2. The bug lives entirely in what body the CLI sends; the stub captures it.
//   3. This is the same approach used by cli-files-write.test.ts.
// ---------------------------------------------------------------------------
describe('od config unset updateInstallMode — CLI sends null in PUT body (regression)', () => {
  let stub: StubServer;

  beforeAll(async () => {
    stub = await startConfigStubServer();
  });

  afterAll(async () => {
    await stub.close();
  });

  beforeEach(() => {
    stub.requests.length = 0;
  });

  it('PUT body includes { updateInstallMode: null } so the daemon can clear it', async () => {
    // Seed the stub so the CLI's GET /api/app-config returns { updateInstallMode: 'manual' }.
    stub.setNextGetResponse({ config: { updateInstallMode: 'manual' } });

    const result = await runCli(
      ['config', 'unset', 'updateInstallMode', '--daemon-url', stub.baseUrl],
      stub.baseUrl,
    );

    // The CLI must exit cleanly.
    expect(result.code).toBe(0);

    // Find the PUT request.
    const putRequest = stub.requests.find((r) => r.method === 'PUT');
    expect(putRequest).toBeDefined();

    const putBody = JSON.parse(putRequest!.body) as Record<string, unknown>;

    // The key MUST be present in the PUT body with value null.
    // With the current buggy code this assertion fails because the key is
    // absent entirely (delete next[key] removes it before JSON.stringify).
    expect(Object.prototype.hasOwnProperty.call(putBody, 'updateInstallMode')).toBe(true);
    expect(putBody['updateInstallMode']).toBeNull();
  });

  it('PUT body does not contain a non-null updateInstallMode after unset', async () => {
    // Belt-and-braces: even if the key is present it must not be 'manual'.
    stub.setNextGetResponse({ config: { updateInstallMode: 'manual' } });

    const result = await runCli(
      ['config', 'unset', 'updateInstallMode', '--daemon-url', stub.baseUrl],
      stub.baseUrl,
    );

    expect(result.code).toBe(0);

    const putRequest = stub.requests.find((r) => r.method === 'PUT');
    expect(putRequest).toBeDefined();
    const putBody = JSON.parse(putRequest!.body) as Record<string, unknown>;

    // The value must not be 'manual' — either null (correct) or absent (buggy).
    // Combined with the previous test, both must pass for a complete fix.
    expect(putBody['updateInstallMode']).not.toBe('manual');
  });
});
