import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

describe('CLI startup boundaries', () => {
  it.each([
    ['doctor', ['doctor', '--help']],
    ['config', ['config', 'get', 'apiProtocol', '--daemon-url', 'http://127.0.0.1:9']],
    ['diagnostics', ['diagnostics', 'export', '--daemon-url', 'http://127.0.0.1:9']],
    ['amr', ['amr', 'status', '--daemon-url', 'http://127.0.0.1:9']],
    ['automation create', [
      'automation', 'create',
      '--name', 'nightly',
      '--prompt', 'refresh the board',
      '--schedule', 'daily:03:00',
      '--skill', 'alpha,beta',
      '--daemon-url', 'http://127.0.0.1:9',
    ]],
    ['automation update', [
      'automation', 'update', 'routine-1',
      '--name', 'nightly',
      '--skill', 'alpha,beta',
      '--daemon-url', 'http://127.0.0.1:9',
    ]],
  ])('initializes module-level bindings before dispatching od %s', async (_name, args) => {
    let output = '';
    try {
      const result = await execFileAsync(
        process.execPath,
        ['--import', 'tsx', cliEntry, ...args],
        {
          cwd: daemonRoot,
          env: { ...process.env },
        },
      );
      output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    } catch (error: unknown) {
      const failed = error as { stdout?: string; stderr?: string };
      output = `${failed.stdout ?? ''}${failed.stderr ?? ''}`;
    }

    expect(output).not.toContain('ReferenceError');
    expect(output).not.toContain('before initialization');
    expect(output).not.toContain('CONFIG_STRING_FLAGS');
    expect(output).not.toContain('DIAGNOSTICS_STRING_FLAGS');
    expect(output).not.toContain('AMR_STRING_FLAGS');
    expect(output).not.toContain('splitAutomationIds');
  });

  it('keeps od daemon start alive until SIGTERM and reports the actual listening port', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-cli-daemon-start-'));
    const dataDir = join(root, 'data');
    await mkdir(dataDir);
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        cliEntry,
        'daemon',
        'start',
        '--headless',
        '--port',
        '0',
      ],
      {
        cwd: daemonRoot,
        env: {
          ...process.env,
          OD_BIND_HOST: '127.0.0.1',
          OD_DATA_DIR: dataDir,
        },
      },
    );

    try {
      const line = await waitForStdoutLine(child, /\[od\] listening on (http:\/\/[^\s]+) \(headless\)/u);
      const match = line.match(/(http:\/\/[^\s]+)/u);
      const daemonUrl = match?.[1];
      expect(daemonUrl).toBeTruthy();
      const parsed = new URL(daemonUrl!);
      expect(Number(parsed.port)).toBeGreaterThan(0);

      const healthResp = await fetch(`${daemonUrl}/api/health`);
      expect(healthResp.status).toBe(200);

      const statusResp = await fetch(`${daemonUrl}/api/daemon/status`);
      expect(statusResp.status).toBe(200);
      const status = await statusResp.json() as { bindHost: string; port: number };
      expect(status.bindHost).toBe('127.0.0.1');
      expect(status.port).toBe(Number(parsed.port));
      expect(child.exitCode).toBeNull();
    } finally {
      await terminateChild(child);
      await rm(root, { recursive: true, force: true });
    }
  });

  // Regression spec for #8593: a repeated SIGINT/SIGTERM while the first
  // signal's graceful shutdown is still in flight must be ignored, so
  // runtime.stop() gets to terminate the live agent child before exit.
  it.each([
    ['bare od', 'SIGINT'],
    ['bare od', 'SIGTERM'],
    ['od daemon start', 'SIGINT'],
    ['od daemon start', 'SIGTERM'],
  ] as const)('%s ignores a repeated %s and still finishes graceful shutdown', async (entryPoint, signal) => {
    const root = await mkdtemp(join(tmpdir(), 'od-cli-double-signal-'));
    const dataDir = join(root, 'data');
    const stubDir = join(root, 'bin');
    const markerPath = join(root, 'agent.pid');
    await mkdir(dataDir, { recursive: true });
    await mkdir(stubDir, { recursive: true });
    // The stub exits immediately for detection probes (--version, run --help,
    // models, ...) and only a real run invocation records its PID and stays
    // alive, so an always-sleeping stub can never hang agent detection.
    const stub = join(stubDir, 'opencode-cli');
    await writeFile(stub, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'run' && !args.includes('--help')) {
  require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, String(process.pid));
  setInterval(() => {}, 60000);
} else {
  process.exit(0);
}
`);
    await chmod(stub, 0o755);

    const port = entryPoint === 'bare od' ? await findFreePort() : 0;
    const args = [
      '--import', 'tsx', cliEntry,
      ...(entryPoint === 'bare od'
        ? ['--port', String(port), '--no-open']
        : ['daemon', 'start', '--headless', '--port', '0']),
    ];
    const child = spawn(process.execPath, args, {
      cwd: daemonRoot,
      env: {
        ...process.env,
        OD_BIND_HOST: '127.0.0.1',
        OD_DATA_DIR: dataDir,
        OD_CHAT_RUN_SHUTDOWN_GRACE_MS: '2000',
        PATH: `${stubDir}${delimiter}${process.env.PATH ?? ''}`,
        POSTHOG_KEY: '',
        POSTHOG_HOST: '',
        OPEN_DESIGN_VELA_TELEMETRY: 'off',
        OPEN_DESIGN_TELEMETRY_RELAY_URL: '',
        LANGFUSE_PUBLIC_KEY: '',
        LANGFUSE_SECRET_KEY: '',
      },
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { output += chunk.toString('utf8'); });
    let agentPid: number | null = null;

    try {
      const listeningPattern = entryPoint === 'bare od'
        ? /\[od\] listening on (http:\/\/[^\s]+)$/u
        : /\[od\] listening on (http:\/\/[^\s]+) \(headless\)/u;
      const line = await waitForStdoutLine(child, listeningPattern);
      const match = line.match(/(http:\/\/[^\s]+)/u);
      expect(match?.[1]).toBeTruthy();
      const daemonUrl = match![1];

      const createResponse = await fetch(`${daemonUrl}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'opencode', message: 'keep running' }),
      });
      expect(createResponse.status).toBe(202);

      await waitForFile(markerPath, 15_000);
      agentPid = Number((await readFile(markerPath, 'utf8')).trim());
      expect(Number.isInteger(agentPid)).toBe(true);
      expect(isPidAlive(agentPid)).toBe(true);

      const runId = (await createResponse.json() as { runId: string }).runId;
      await waitForRunRunning(`${daemonUrl}/api/runs/${runId}`, 15_000);
      expect(isPidAlive(agentPid)).toBe(true);

      const t0 = Date.now();
      let exitAt = 0;
      child.once('exit', () => { exitAt = Date.now(); });
      child.kill(signal);
      await sleep(800);
      child.kill(signal);
      await sleep(400);
      child.kill(signal);
      await waitForExit(child);

      // A hard exit on the second signal lands well under this: the first
      // signal's shutdown waits OD_CHAT_RUN_SHUTDOWN_GRACE_MS first.
      expect.soft(exitAt - t0).toBeGreaterThanOrEqual(1800);
      expect.soft(child.signalCode).toBeNull();
      expect.soft(child.exitCode).toBe(0);
      expect.soft(output).toContain('ignored: shutdown already in progress');
      expect.soft(await waitForPidDead(agentPid, 10_000)).toBe(true);
    } finally {
      if (agentPid !== null) {
        try {
          process.kill(-agentPid, 'SIGKILL');
        } catch {
          try { process.kill(agentPid, 'SIGKILL'); } catch { /* already gone */ }
        }
      }
      await terminateChild(child);
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('reconciles a durable running message after a real daemon process restart', { timeout: 60_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-cli-daemon-restart-'));
    const dataDir = join(root, 'data');
    await mkdir(dataDir);
    const port = await findFreePort();
    const env = {
      ...process.env,
      OD_BIND_HOST: '127.0.0.1',
      OD_DATA_DIR: dataDir,
      POSTHOG_KEY: '',
      POSTHOG_HOST: '',
      OPEN_DESIGN_VELA_TELEMETRY: 'off',
      OPEN_DESIGN_TELEMETRY_RELAY_URL: '',
      LANGFUSE_PUBLIC_KEY: '',
      LANGFUSE_SECRET_KEY: '',
    };
    const args = [
      '--import', 'tsx', cliEntry,
      'daemon', 'start', '--headless', '--port', String(port),
    ];
    const first = spawn(process.execPath, args, { cwd: daemonRoot, env });
    const runId = 'run-real-process-restart';
    const messageId = 'message-real-process-restart';
    const conversationId = 'conversation-real-process-restart';
    const projectId = 'project-real-process-restart';
    const runDir = join(dataDir, 'runs', runId);
    const statePath = join(runDir, 'state.json');

    try {
      await waitForStdoutLine(first, /\[od\] listening on (http:\/\/[^\s]+)/u);
      const db = new Database(join(dataDir, 'app.sqlite'));
      try {
        const now = Date.now();
        db.exec('PRAGMA foreign_keys = ON');
        db.prepare(
          `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        ).run(projectId, 'restart fixture', now, now);
        db.prepare(
          `INSERT INTO conversations (id, project_id, title, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(conversationId, projectId, 'restart fixture', now, now);
        db.prepare(
          `INSERT INTO messages
             (id, conversation_id, role, content, run_id, run_status,
              events_json, position, created_at, started_at)
           VALUES (?, ?, 'assistant', '', ?, 'running', '[]', 0, ?, ?)`,
        ).run(messageId, conversationId, runId, now, now);
      } finally {
        db.close();
      }
      await mkdir(runDir, { recursive: true });
      await writeFile(statePath, `${JSON.stringify({
        schemaVersion: 1,
        id: runId,
        projectId,
        conversationId,
        assistantMessageId: messageId,
        agentId: 'claude',
        status: 'running',
        createdAt: Date.now() - 1_000,
        updatedAt: Date.now(),
        analyticsRecovery: {
          context: {},
          properties: { project_id: projectId, conversation_id: conversationId, run_id: runId },
          insertId: 'restart-fixture-created',
        },
      })}\n`);

      // SIGKILL models the process-loss case; graceful SIGTERM would run the
      // normal shutdown path and would not exercise boot reconciliation.
      first.kill('SIGKILL');
      await waitForExit(first);

      const second = spawn(process.execPath, args, { cwd: daemonRoot, env });
      try {
        const line = await waitForStdoutLine(second, /\[od\] listening on (http:\/\/[^\s]+)/u);
        expect(line).toContain(`127.0.0.1:${port}`);
        await waitFor(() => {
          const state = JSON.parse(readFileSync(statePath, 'utf8')) as {
            status?: string;
            analyticsRecovery?: { completedAt?: number };
          };
          const checkDb = new Database(join(dataDir, 'app.sqlite'), { readonly: true });
          try {
            const row = checkDb.prepare(`SELECT run_status AS status FROM messages WHERE id = ?`).get(messageId) as { status?: string } | undefined;
            return state.status === 'failed'
              && row?.status === 'failed'
              && typeof state.analyticsRecovery?.completedAt === 'number';
          } finally {
            checkDb.close();
          }
        });
        const recoveredState = JSON.parse(await readFile(statePath, 'utf8')) as {
          status: string;
          errorCode?: string;
          terminalRecoveryReason?: string;
          analyticsRecovery?: { completedAt?: number };
        };
        expect(recoveredState).toMatchObject({
          status: 'failed',
          errorCode: 'DAEMON_RESTARTED',
          terminalRecoveryReason: 'daemon_restart',
          analyticsRecovery: { completedAt: expect.any(Number) },
        });

        const checkpoint = recoveredState.analyticsRecovery?.completedAt;
        await terminateChild(second);
        const reconciliationSentinelId = 'run-third-boot-reconciliation-sentinel';
        const reconciliationSentinelDir = join(dataDir, 'runs', reconciliationSentinelId);
        const reconciliationSentinelPath = join(reconciliationSentinelDir, 'state.json');
        await mkdir(reconciliationSentinelDir, { recursive: true });
        await writeFile(reconciliationSentinelPath, `${JSON.stringify({
          schemaVersion: 1,
          id: reconciliationSentinelId,
          projectId: null,
          conversationId: null,
          assistantMessageId: null,
          agentId: null,
          status: 'running',
          createdAt: Date.now() - 1_000,
          updatedAt: Date.now(),
          langfuseCompletedAt: Date.now(),
        })}\n`);
        const third = spawn(process.execPath, args, { cwd: daemonRoot, env });
        try {
          await Promise.all([
            waitForStdoutLine(third, /\[od\] listening on (http:\/\/[^\s]+)/u),
            waitForStdoutLine(third, /\[runs\] reconciled interrupted run terminals/u),
          ]);
          const replayedState = JSON.parse(await readFile(statePath, 'utf8')) as {
            status?: string;
            analyticsRecovery?: { completedAt?: number };
          };
          const sentinelState = JSON.parse(await readFile(reconciliationSentinelPath, 'utf8')) as {
            status?: string;
          };
          expect(sentinelState.status).toBe('failed');
          expect(replayedState.status).toBe('failed');
          expect(replayedState.analyticsRecovery?.completedAt).toBe(checkpoint);
        } finally {
          await terminateChild(third);
        }
      } finally {
        await terminateChild(second);
      }
    } finally {
      await terminateChild(first);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not import daemon startup code for media client commands', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-cli-media-'));
    const dataDir = join(root, 'data');
    await mkdir(dataDir);
    await chmod(dataDir, 0o500);

    try {
      await execFileAsync(
        process.execPath,
        [
          '--import',
          'tsx',
          cliEntry,
          'media',
          'generate',
          '--project',
          'repro',
          '--surface',
          'image',
          '--model',
          'gpt-image-2',
          '--prompt',
          'test',
          '--daemon-url',
          'http://127.0.0.1:59999',
        ],
        {
          cwd: daemonRoot,
          env: {
            ...process.env,
            OD_DATA_DIR: dataDir,
          },
        },
      );
      throw new Error('media command unexpectedly succeeded');
    } catch (error: unknown) {
      const failed = error as { code?: number; stderr?: string };
      const stderr = failed.stderr ?? '';
      expect(failed.code).toBe(3);
      expect(JSON.parse(stderr)).toEqual({
        error: {
          code: 'MEDIA_DISPATCHER_UNREACHABLE',
          message: 'local media dispatcher could not be reached',
          nextStep: 'retry-later',
        },
      });
      expect(stderr).not.toContain('OD_DATA_DIR');
      expect(stderr).not.toContain('127.0.0.1');
    } finally {
      await chmod(dataDir, 0o700).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses the token-gated media endpoint without falling back when policy denies generation', async () => {
    const seen: Array<{ url: string | undefined; authorization: string | undefined }> = [];
    const server = http.createServer((req, res) => {
      seen.push({
        url: req.url,
        authorization: req.headers.authorization,
      });
      req.resume();
      if (req.url === '/api/tools/media/generate') {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          error: {
            code: 'MEDIA_EXECUTION_DISABLED',
            message: 'media generation is disabled for this run',
          },
        }));
        return;
      }
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unexpected fallback' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const daemonUrl = `http://127.0.0.1:${port}`;

    try {
      await execFileAsync(
        process.execPath,
        [
          '--import',
          'tsx',
          cliEntry,
          'media',
          'generate',
          '--project',
          'project-1',
          '--surface',
          'image',
          '--model',
          'gpt-image-2',
          '--prompt',
          'test',
          '--daemon-url',
          daemonUrl,
        ],
        {
          cwd: daemonRoot,
          env: {
            ...process.env,
            OD_TOOL_TOKEN: 'run-token',
          },
        },
      );
      throw new Error('media command unexpectedly succeeded');
    } catch (error: unknown) {
      const failed = error as { code?: number; stderr?: string };
      expect(failed.code).toBe(4);
      expect(failed.stderr ?? '').toContain('MEDIA_EXECUTION_DISABLED');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    expect(seen).toEqual([
      {
        url: '/api/tools/media/generate',
        authorization: 'Bearer run-token',
      },
    ]);
  });

  it('prints AMR status JSON from the daemon status endpoint without wallet fallback', async () => {
    const seen: Array<{ method: string | undefined; url: string | undefined }> = [];
    const server = http.createServer((req, res) => {
      seen.push({ method: req.method, url: req.url });
      req.resume();
      if (req.method === 'GET' && req.url === '/api/integrations/vela/status') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          loggedIn: true,
          profile: 'local',
          user: { email: 'amr@example.com' },
          account: { plan: 'plus', balanceUsd: '9.5000' },
          configPath: '/Users/test/.amr/config.json',
        }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unexpected' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const daemonUrl = `http://127.0.0.1:${port}`;

    try {
      const result = await execFileAsync(
        process.execPath,
        [
          '--import',
          'tsx',
          cliEntry,
          'amr',
          'status',
          '--daemon-url',
          daemonUrl,
          '--json',
        ],
        {
          cwd: daemonRoot,
          env: { ...process.env },
        },
      );
      expect(JSON.parse(result.stdout)).toMatchObject({
        loggedIn: true,
        profile: 'local',
        user: { email: 'amr@example.com' },
        account: { plan: 'plus', balanceUsd: '9.5000' },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    expect(seen).toEqual([
      { method: 'GET', url: '/api/integrations/vela/status' },
    ]);
  });

  it('prints AMR wallet fallback status JSON when daemon status has no account balance', async () => {
    const seen: Array<{ method: string | undefined; url: string | undefined }> = [];
    const server = http.createServer((req, res) => {
      seen.push({ method: req.method, url: req.url });
      req.resume();
      if (req.method === 'GET' && req.url === '/api/integrations/vela/status') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          loggedIn: true,
          profile: 'local',
          user: { email: 'amr@example.com' },
          configPath: '/Users/test/.amr/config.json',
        }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/integrations/vela/wallet?refresh=1') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          status: 'available',
          profile: 'local',
          user: { email: 'amr@example.com' },
          balanceUsd: '0.1000',
          updatedAt: '2026-06-23T06:05:18.782Z',
          fetchedAt: '2026-06-23T06:05:19.000Z',
          stale: false,
          source: 'vela_api',
        }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unexpected' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const daemonUrl = `http://127.0.0.1:${port}`;

    try {
      const result = await execFileAsync(
        process.execPath,
        [
          '--import',
          'tsx',
          cliEntry,
          'amr',
          'status',
          '--daemon-url',
          daemonUrl,
          '--refresh',
          '--json',
        ],
        {
          cwd: daemonRoot,
          env: { ...process.env },
        },
      );
      expect(JSON.parse(result.stdout)).toMatchObject({
        loggedIn: true,
        user: { email: 'amr@example.com' },
        account: { balanceUsd: '0.1000' },
        wallet: {
          status: 'available',
          balanceUsd: '0.1000',
          source: 'vela_api',
        },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    expect(seen).toEqual([
      { method: 'GET', url: '/api/integrations/vela/status' },
      { method: 'GET', url: '/api/integrations/vela/wallet?refresh=1' },
    ]);
  });

  it('prints AMR text status with fallback balance and no fabricated plan', async () => {
    const server = http.createServer((req, res) => {
      req.resume();
      if (req.method === 'GET' && req.url === '/api/integrations/vela/status') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          loggedIn: true,
          profile: 'local',
          user: { email: 'amr@example.com' },
          configPath: '/Users/test/.amr/config.json',
        }));
        return;
      }
      if (req.method === 'GET' && req.url === '/api/integrations/vela/wallet') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          status: 'available',
          profile: 'local',
          user: { email: 'amr@example.com' },
          balanceUsd: '0.1000',
          updatedAt: '2026-06-23T06:05:18.782Z',
          fetchedAt: '2026-06-23T06:05:19.000Z',
          stale: false,
          source: 'vela_api',
        }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unexpected' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const daemonUrl = `http://127.0.0.1:${port}`;

    try {
      const result = await execFileAsync(
        process.execPath,
        [
          '--import',
          'tsx',
          cliEntry,
          'amr',
          'status',
          '--daemon-url',
          daemonUrl,
        ],
        {
          cwd: daemonRoot,
          env: { ...process.env },
        },
      );
      expect(result.stdout).toContain('AMR account\tamr@example.com');
      expect(result.stdout).toContain('Profile\tlocal');
      expect(result.stdout).toContain('Wallet balance\t$0.1000');
      expect(result.stdout).toContain('Source\tvela_api');
      expect(result.stdout).not.toContain('Plan\t');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

function waitForStdoutLine(
  child: ChildProcessWithoutNullStreams,
  pattern: RegExp,
  timeoutMs = 15_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for stdout ${pattern}; output:\n${output}`));
    }, timeoutMs);
    const onData = (chunk: Buffer) => {
      output += chunk.toString('utf8');
      const line = output.split(/\r?\n/u).find((candidate) => pattern.test(candidate));
      if (line) {
        cleanup();
        resolve(line);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(new Error(`child exited before stdout matched ${pattern}: code=${code} signal=${signal}; output:\n${output}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('error', onError);
      child.off('exit', onExit);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', onError);
    child.on('exit', onExit);
  });
}

async function findFreePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!port) throw new Error('failed to allocate a free TCP port');
  return port;
}

async function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out waiting for daemon restart reconciliation');
}

async function waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function waitForFile(path: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (existsSync(path)) return;
    await sleep(50);
  }
  throw new Error(`timed out waiting for file: ${path}`);
}

async function waitForPidDead(pid: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isPidAlive(pid)) return true;
    await sleep(50);
  }
  return !isPidAlive(pid);
}

async function waitForRunRunning(url: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const body = await response.json() as { status?: string };
        if (body.status === 'running') return;
      }
    } catch {
      // transient fetch failure: keep polling until the deadline
    }
    await sleep(100);
  }
  throw new Error(`timed out waiting for run to reach running: ${url}`);
}

async function terminateChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });
  child.kill('SIGTERM');
  const timeout = new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5_000);
    timer.unref?.();
  });
  await Promise.race([exited, timeout]);
}
