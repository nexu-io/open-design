// Coverage for the structured diagnostics envelope on agent-mode connection
// test responses.

import type http from 'node:http';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  STDERR_EXCERPT_MAX_CHARS,
  buildAgentDiagnostics,
  createAgentSink,
  recoveryHintsFor,
  sanitizeStderrExcerpt,
  testAgentConnection,
} from '../src/connectionTest.js';
import { startServer } from '../src/server.js';

interface StartedServer {
  url: string;
  server: http.Server;
}

const realFetch = globalThis.fetch;
let baseUrl: string;
let server: http.Server;

async function withFakeAgent<T>(
  binName: string,
  script: string,
  run: () => Promise<T>,
): Promise<T> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-conn-test-diag-bin-'));
  const oldPath = process.env.PATH;
  try {
    if (process.platform === 'win32') {
      const runner = path.join(dir, `${binName}-test-runner.cjs`);
      await fsp.writeFile(runner, script);
      await fsp.writeFile(
        path.join(dir, `${binName}.cmd`),
        `@echo off\r\nnode "${runner}" %*\r\n`,
      );
    } else {
      const bin = path.join(dir, binName);
      await fsp.writeFile(bin, `#!/usr/bin/env node\n${script}`);
      await fsp.chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${path.delimiter}${oldPath ?? ''}`;
    return await run();
  } finally {
    process.env.PATH = oldPath;
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function withFakeCodex<T>(script: string, run: () => Promise<T>): Promise<T> {
  return withFakeAgent('codex', script, run);
}

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  baseUrl = started.url;
  server = started.server;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('sanitizeStderrExcerpt', () => {
  it('strips ANSI CSI escape sequences', () => {
    expect(sanitizeStderrExcerpt('\x1b[31mboom\x1b[0m')).toBe('boom');
  });

  it('strips ANSI private-mode sequences', () => {
    expect(sanitizeStderrExcerpt('start\x1b[?25lend')).toBe('startend');
  });

  it('head-truncates output to the configured max length by character count', () => {
    const head = 'HEAD-MARK-';
    const long = head + 'x'.repeat(800);
    const out = sanitizeStderrExcerpt(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(STDERR_EXCERPT_MAX_CHARS);
    expect(out!.startsWith(head)).toBe(true);
  });

  it('keeps the actionable head of stderr when the input overflows the budget', () => {
    const head = 'Error: actionable cause\n';
    const long = head + 'x'.repeat(STDERR_EXCERPT_MAX_CHARS + 200);
    const out = sanitizeStderrExcerpt(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(STDERR_EXCERPT_MAX_CHARS);
    expect(out!.startsWith('Error: actionable cause')).toBe(true);
  });

  it('returns null for null, undefined, and empty inputs', () => {
    expect(sanitizeStderrExcerpt(null)).toBeNull();
    expect(sanitizeStderrExcerpt(undefined)).toBeNull();
    expect(sanitizeStderrExcerpt('')).toBeNull();
    expect(sanitizeStderrExcerpt('   ')).toBeNull();
  });

  it('redacts bearer tokens and api-key headers', () => {
    const out = sanitizeStderrExcerpt('authorization: Bearer sk-xyz123 failed');
    expect(out).not.toBeNull();
    expect(out!).toContain('[REDACTED]');
    expect(out!).not.toContain('sk-xyz123');
  });

  it('redacts bare configured secret values when the caller threads exactSecrets', () => {
    const out = sanitizeStderrExcerpt(
      'Error: invalid api key sk-rotateMe',
      ['sk-rotateMe'],
    );
    expect(out).not.toBeNull();
    expect(out!).not.toContain('sk-rotateMe');
    expect(out!).toContain('[REDACTED]');
  });

  it('leaves bare tokens with no header/query context unredacted when exactSecrets is omitted', () => {
    const out = sanitizeStderrExcerpt('Error: invalid api key sk-rotateMe');
    expect(out).not.toBeNull();
    expect(out!).toContain('sk-rotateMe');
  });
});

describe('recoveryHintsFor', () => {
  it('returns a non-empty hint set for binary_resolution failures', () => {
    const hints = recoveryHintsFor({
      phase: 'binary_resolution',
      kind: 'agent_not_installed',
      agentId: 'codex',
    });
    expect(hints.length).toBeGreaterThan(0);
    for (const hint of hints) {
      expect(hint.length).toBeLessThanOrEqual(200);
    }
  });

  it('mentions upgrade or install when an agent fails to spawn during version probe', () => {
    const hints = recoveryHintsFor({
      phase: 'version_probe',
      kind: 'agent_spawn_failed',
      agentId: 'opencode',
    });
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.join(' ').toLowerCase()).toMatch(/(upgrade|install|reinstall|update)/);
  });

  it('references CLAUDE_CONFIG_DIR or /login when Claude auth is missing', () => {
    const hints = recoveryHintsFor({
      phase: 'auth_probe',
      kind: 'agent_auth_required',
      agentId: 'claude',
    });
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.join(' ')).toMatch(/(\/login|CLAUDE_CONFIG_DIR)/);
  });

  it('returns an empty array for the success path', () => {
    const hints = recoveryHintsFor({
      phase: 'stream',
      kind: 'success',
      agentId: 'codex',
    });
    expect(hints).toEqual([]);
  });

  it('caps the total number of hints at five', () => {
    const hints = recoveryHintsFor({
      phase: 'spawn',
      kind: 'unknown',
      agentId: 'codex',
    });
    expect(hints.length).toBeLessThanOrEqual(5);
  });
});

describe('buildAgentDiagnostics', () => {
  it('returns a fully-populated envelope when binary resolution failed', () => {
    const d = buildAgentDiagnostics({
      agentId: 'codex',
      agentName: 'Codex CLI',
      kind: 'agent_not_installed',
      phase: 'binary_resolution',
      binaryPath: null,
      binaryVersion: null,
      stderrRaw: null,
    });
    expect(d.agentId).toBe('codex');
    expect(d.agentName).toBe('Codex CLI');
    expect(d.phase).toBe('binary_resolution');
    expect(d.binaryPath).toBeNull();
    expect(d.binaryVersion).toBeNull();
    expect(d.stderrExcerpt).toBeNull();
    expect(d.recoveryHints.length).toBeGreaterThan(0);
  });

  it('sanitizes the supplied stderr before storing it', () => {
    const d = buildAgentDiagnostics({
      agentId: 'codex',
      agentName: 'Codex CLI',
      kind: 'agent_spawn_failed',
      phase: 'spawn',
      binaryPath: '/usr/local/bin/codex',
      binaryVersion: '0.1.2',
      stderrRaw: '\x1b[31mfatal: authorization: Bearer sk-abc\x1b[0m',
    });
    expect(d.stderrExcerpt).not.toBeNull();
    expect(d.stderrExcerpt!).not.toContain('\x1b[');
    expect(d.stderrExcerpt!).not.toContain('sk-abc');
    expect(d.stderrExcerpt!).toContain('[REDACTED]');
  });

  it('scrubs the exact agent secret values supplied by the caller', () => {
    const d = buildAgentDiagnostics({
      agentId: 'codex',
      agentName: 'Codex CLI',
      kind: 'agent_spawn_failed',
      phase: 'spawn',
      binaryPath: '/usr/local/bin/codex',
      binaryVersion: '0.1.2',
      stderrRaw: 'Error: api key sk-xyz rejected at https://api.example.com',
      agentSecrets: ['sk-xyz'],
    });
    expect(d.stderrExcerpt).not.toBeNull();
    expect(d.stderrExcerpt!).not.toContain('sk-xyz');
    expect(d.stderrExcerpt!).toContain('[REDACTED]');
  });

  it('scrubs AWS/GCP-style cloud-provider secrets when the caller filters configuredAgentEnv through the broadened regex', () => {
    const configuredAgentEnv = {
      OPENAI_API_KEY: 'sk-openai-rotateMe',
      GITHUB_TOKEN: 'ghp_tokenvalue',
      AWS_SECRET_ACCESS_KEY: 'awsSecret/+ABC123',
      GCP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----abc',
      DB_PASSWORD: 'hunter2',
      AZURE_CLIENT_SECRET: 'azureSecretValue',
      CODEX_BIN: '/usr/local/bin/codex',
    };
    const agentSecrets = Object.entries(configuredAgentEnv)
      .filter(([k]) => /(_API_KEY|_TOKEN|_SECRET|_PASSWORD|_PRIVATE_KEY|_SECRET_KEY|_ACCESS_KEY)$/i.test(k))
      .map(([, v]) => v);
    expect(agentSecrets).toContain('awsSecret/+ABC123');
    expect(agentSecrets).toContain('-----BEGIN PRIVATE KEY-----abc');
    expect(agentSecrets).toContain('hunter2');
    expect(agentSecrets).toContain('azureSecretValue');
    expect(agentSecrets).not.toContain('/usr/local/bin/codex');
    const d = buildAgentDiagnostics({
      agentId: 'codex',
      agentName: 'Codex CLI',
      kind: 'agent_spawn_failed',
      phase: 'spawn',
      binaryPath: '/usr/local/bin/codex',
      binaryVersion: '0.1.2',
      stderrRaw:
        'Error: AWS rejected key awsSecret/+ABC123; also DB_PASSWORD=hunter2 leaked; private key -----BEGIN PRIVATE KEY-----abc; binary /usr/local/bin/codex still resolves',
      agentSecrets,
    });
    expect(d.stderrExcerpt).not.toBeNull();
    expect(d.stderrExcerpt!).not.toContain('awsSecret/+ABC123');
    expect(d.stderrExcerpt!).not.toContain('hunter2');
    expect(d.stderrExcerpt!).not.toContain('-----BEGIN PRIVATE KEY-----abc');
    expect(d.stderrExcerpt!).toContain('/usr/local/bin/codex');
  });
});

describe('createAgentSink stderr capture', () => {
  it('preserves enough leading bytes for the sanitizer to head-truncate cleanly when stderr arrives across multiple chunks containing an ANSI escape on the boundary', () => {
    const sink = createAgentSink();
    const head = 'HEAD-MARK' + 'a'.repeat(STDERR_EXCERPT_MAX_CHARS - 14);
    sink.send('stderr', { chunk: head });
    sink.send('stderr', { chunk: '\x1b[31m' });
    sink.send('stderr', { chunk: 'tail-text-tail-text-tail-text' });
    const capture = sink.getStderrCapture();
    expect(capture.length).toBeGreaterThanOrEqual(STDERR_EXCERPT_MAX_CHARS);
    const sanitized = sanitizeStderrExcerpt(capture);
    expect(sanitized).not.toBeNull();
    expect(sanitized!).not.toContain('\x1b[');
    expect(sanitized!.length).toBeLessThanOrEqual(STDERR_EXCERPT_MAX_CHARS);
    expect(sanitized!.startsWith('HEAD-MARK')).toBe(true);
    sink.dispose();
  });

  it('keeps the head of stderr when more than the buffer budget is pushed through the sink', () => {
    const sink = createAgentSink();
    sink.send('stderr', { chunk: 'HEAD-MARKER: Error line 1\n' });
    sink.send('stderr', { chunk: 'x'.repeat(800) });
    const capture = sink.getStderrCapture();
    const sanitized = sanitizeStderrExcerpt(capture);
    expect(sanitized).not.toBeNull();
    expect(sanitized!.startsWith('HEAD-MARKER:')).toBe(true);
    sink.dispose();
  });
});

describe('testAgentConnection diagnostics envelope', () => {
  it('attaches diagnostics with a null binaryPath when the agent id is unknown', async () => {
    const result = await testAgentConnection({ agentId: 'no-such-agent' });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.agentId).toBe('no-such-agent');
    expect(result.diagnostics!.agentName).toBe('no-such-agent');
    expect(result.diagnostics!.phase).toBe('binary_resolution');
    expect(result.diagnostics!.binaryPath).toBeNull();
    expect(result.diagnostics!.binaryVersion).toBeNull();
    expect(result.diagnostics!.recoveryHints.length).toBeGreaterThan(0);
  });

  it('reports a stream-phase diagnostics envelope on the Codex success path', async () => {
    await withFakeCodex(
      `
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } }));
setImmediate(() => process.exit(0));
`,
      async () => {
        const result = await testAgentConnection({ agentId: 'codex' });
        expect(result.ok).toBe(true);
        expect(result.diagnostics).toBeDefined();
        expect(result.diagnostics!.agentId).toBe('codex');
        expect(result.diagnostics!.phase).toBe('stream');
        expect(typeof result.diagnostics!.binaryPath).toBe('string');
        expect(result.diagnostics!.binaryPath!.endsWith('codex')).toBe(true);
      },
    );
  });

  it('returns sanitized stderr and at least one recovery hint when the Codex CLI exits non-zero with ANSI-laced stderr', async () => {
    await withFakeCodex(
      `
process.stderr.write('\\u001b[31mError: authentication failed (sk-secret-cfg)\\u001b[0m\\n');
setImmediate(() => process.exit(1));
`,
      async () => {
        const result = await testAgentConnection({
          agentId: 'codex',
          agentCliEnv: { codex: { CODEX_API_KEY: 'sk-secret-cfg' } },
        });
        expect(result.ok).toBe(false);
        expect(result.diagnostics).toBeDefined();
        expect(result.diagnostics!.agentId).toBe('codex');
        expect(typeof result.diagnostics!.binaryPath).toBe('string');
        expect(result.diagnostics!.binaryPath!.endsWith('codex')).toBe(true);
        expect(result.diagnostics!.stderrExcerpt).not.toBeNull();
        expect(result.diagnostics!.stderrExcerpt!).not.toContain('\x1b[');
        expect(result.diagnostics!.stderrExcerpt!).not.toContain('sk-secret-cfg');
        expect(result.diagnostics!.stderrExcerpt!).toContain('[REDACTED]');
        expect(result.diagnostics!.recoveryHints.length).toBeGreaterThanOrEqual(1);
      },
    );
  });

  it('scrubs bare secrets inherited from process.env (not just the user-configured agent env) from the diagnostics envelope', async () => {
    const leakKey = `sk-from-process-env-${Date.now()}`;
    const oldOpenAI = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = leakKey;
    try {
      await withFakeCodex(
        `
if (process.argv.includes('--version')) {
  process.stdout.write('codex 9.9.9 ' + (process.env.OPENAI_API_KEY || '') + '\\n');
  process.exit(0);
}
process.stderr.write('boot failed using ' + (process.env.OPENAI_API_KEY || '') + '\\n');
setImmediate(() => process.exit(1));
`,
        async () => {
          const result = await testAgentConnection({ agentId: 'codex' });
          expect(result.diagnostics).toBeDefined();
          expect(result.diagnostics!.stderrExcerpt).not.toBeNull();
          expect(result.diagnostics!.stderrExcerpt!).not.toContain(leakKey);
          expect(result.diagnostics!.stderrExcerpt!).toContain('[REDACTED]');
          if (result.diagnostics!.binaryVersion) {
            expect(result.diagnostics!.binaryVersion).not.toContain(leakKey);
          }
        },
      );
    } finally {
      if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = oldOpenAI;
    }
  });

  it('exposes the same diagnostics object through POST /api/test/connection', async () => {
    await withFakeCodex(
      `
process.stderr.write('boot failed: missing config\\n');
setImmediate(() => process.exit(1));
`,
      async () => {
        const res = await realFetch(`${baseUrl}/api/test/connection`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'agent', agentId: 'codex' }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.ok).toBe(false);
        const diag = body.diagnostics as Record<string, unknown> | undefined;
        expect(diag).toBeDefined();
        expect(diag!.agentId).toBe('codex');
        expect(typeof diag!.binaryPath).toBe('string');
        expect(diag!.stderrExcerpt).toBeTypeOf('string');
        expect(Array.isArray(diag!.recoveryHints)).toBe(true);
      },
    );
  });
});
