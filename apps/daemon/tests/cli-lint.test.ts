// Contract test for the `od lint` CLI surface. Keeps the UI / API / CLI
// triple wired together (AGENTS.md "Capability exposure"): the CLI must
// drive the same POST /api/artifacts/lint endpoint the web layer uses,
// with --json support for headless agents.
//
// Same stub-server process harness as cli-templates.test.ts /
// cli-deploy.test.ts: we prove SUBCOMMAND_MAP routes `lint`, parseFlags
// accepts the documented flags, the right HTTP call is emitted, and the
// exit code follows the --fail-on threshold — without booting the daemon.

import http from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ArtifactLintFinding } from '@open-design/contracts';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const REPO_ROOT = pathResolve(__dirname, '../../..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

const P0_FINDING: ArtifactLintFinding = {
  severity: 'P0',
  id: 'ai-default-indigo',
  message: 'Found a default LLM accent color (#6366f1).',
  fix: 'Replace with var(--accent).',
  snippet: '#6366f1',
};
const P1_FINDING: ArtifactLintFinding = {
  severity: 'P1',
  id: 'slide-rhythm',
  message: 'Three same-theme slides in a row.',
  fix: 'Swap the middle slide theme.',
};
const P2_FINDING: ArtifactLintFinding = {
  severity: 'P2',
  id: 'advisory-example',
  message: 'Advisory finding.',
  fix: 'Optional.',
};

interface CapturedRequest {
  method: string;
  url: string;
  body: string;
}

interface StubServer {
  baseUrl: string;
  requests: CapturedRequest[];
  setResponder: (
    fn: (req: CapturedRequest) => { status: number; body: unknown } | null,
  ) => void;
  close: () => Promise<void>;
}

async function startStubServer(): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
  let responder:
    | ((req: CapturedRequest) => { status: number; body: unknown } | null)
    | null = null;

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const captured: CapturedRequest = {
        method: req.method ?? '',
        url: req.url ?? '',
        body: raw,
      };
      requests.push(captured);
      const response = responder?.(captured) ?? { status: 200, body: { findings: [], agentMessage: '' } };
      res.statusCode = response.status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(response.body));
    });
  });

  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('stub server has no address');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    requests,
    setResponder: (fn) => {
      responder = fn;
    },
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()));
      }),
  };
}

async function runCli(
  args: string[],
  options: { env?: NodeJS.ProcessEnv; stdin?: string } = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
  };
  delete env.NODE_OPTIONS;
  return await new Promise((resolveRun) => {
    const child = execFile(
      process.execPath,
      [TSX_CLI, CLI_SRC, ...args],
      {
        cwd: DAEMON_ROOT,
        env,
        timeout: 15_000,
        maxBuffer: 4 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        const failed = err as { code?: number | null } | null;
        resolveRun({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          code: failed ? failed.code ?? 1 : 0,
        });
      },
    );
    if (options.stdin != null) {
      child.stdin?.write(options.stdin);
    }
    child.stdin?.end();
  });
}

// Reserve a port the OS says is free, then close it, so connections fail
// with ECONNREFUSED (same rationale as cli-templates.test.ts #2428 fix:
// a `port + 1` heuristic can silently hit an unrelated server).
async function reserveAndReleasePort(): Promise<number> {
  return new Promise((resolveListen, rejectListen) => {
    const probe = http.createServer();
    probe.unref();
    probe.once('error', rejectListen);
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address();
      if (!addr || typeof addr === 'string') {
        probe.close();
        rejectListen(new Error('probe server has no address'));
        return;
      }
      const { port } = addr;
      probe.close((err) => (err ? rejectListen(err) : resolveListen(port)));
    });
  });
}

describe('od lint CLI entrypoint', () => {
  let stub: StubServer;
  let fixtureDir: string;
  let cleanFile: string;

  beforeAll(async () => {
    stub = await startStubServer();
    fixtureDir = mkdtempSync(join(tmpdir(), 'od-cli-lint-'));
    cleanFile = join(fixtureDir, 'clean.html');
    writeFileSync(cleanFile, '<main><p>Hello</p></main>');
  });

  afterAll(async () => {
    await stub.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('POSTs the file body to /api/artifacts/lint and exits 0 on clean', async () => {
    stub.setResponder(() => ({ status: 200, body: { findings: [], agentMessage: '' } }));
    const before = stub.requests.length;
    const run = await runCli(['lint', cleanFile, '--daemon-url', stub.baseUrl]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('clean — 0 findings');
    const req = stub.requests[before];
    expect(req?.method).toBe('POST');
    expect(req?.url).toBe('/api/artifacts/lint');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({ html: '<main><p>Hello</p></main>' });
  });

  it('reads stdin when the file is `-` and sends it verbatim', async () => {
    stub.setResponder(() => ({ status: 200, body: { findings: [], agentMessage: '' } }));
    const before = stub.requests.length;
    const run = await runCli(['lint', '-', '--daemon-url', stub.baseUrl], {
      stdin: '<p>from stdin</p>',
    });
    expect(run.code).toBe(0);
    expect(JSON.parse(stub.requests[before]?.body ?? '{}')).toEqual({ html: '<p>from stdin</p>' });
  });

  it('exits 1 on a P0 finding at the default threshold and prints it', async () => {
    stub.setResponder(() => ({
      status: 200,
      body: { findings: [P0_FINDING], agentMessage: '<artifact-lint>x</artifact-lint>' },
    }));
    const run = await runCli(['lint', cleanFile, '--daemon-url', stub.baseUrl]);
    expect(run.code).toBe(1);
    expect(run.stdout).toContain('[P0] ai-default-indigo');
    expect(run.stdout).toContain('fix: Replace with var(--accent).');
  });

  it('exits 0 on a P1-only response at the default p0 threshold', async () => {
    stub.setResponder(() => ({ status: 200, body: { findings: [P1_FINDING], agentMessage: '' } }));
    const run = await runCli(['lint', cleanFile, '--daemon-url', stub.baseUrl]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('[P1] slide-rhythm');
  });

  it('honors --fail-on p1 and p2 thresholds', async () => {
    stub.setResponder(() => ({ status: 200, body: { findings: [P1_FINDING], agentMessage: '' } }));
    expect((await runCli(['lint', cleanFile, '--fail-on', 'p1', '--daemon-url', stub.baseUrl])).code).toBe(1);

    stub.setResponder(() => ({ status: 200, body: { findings: [P2_FINDING], agentMessage: '' } }));
    expect((await runCli(['lint', cleanFile, '--fail-on', 'p1', '--daemon-url', stub.baseUrl])).code).toBe(0);
    expect((await runCli(['lint', cleanFile, '--fail-on', 'p2', '--daemon-url', stub.baseUrl])).code).toBe(1);
  });

  it('honors --fail-on none even with P0 findings', async () => {
    stub.setResponder(() => ({ status: 200, body: { findings: [P0_FINDING], agentMessage: '' } }));
    const run = await runCli(['lint', cleanFile, '--fail-on', 'none', '--daemon-url', stub.baseUrl]);
    expect(run.code).toBe(0);
  });

  it('prints a machine envelope with --json (counts, findings, agentMessage)', async () => {
    stub.setResponder(() => ({
      status: 200,
      body: { findings: [P0_FINDING, P1_FINDING], agentMessage: '<artifact-lint>m</artifact-lint>' },
    }));
    const run = await runCli(['lint', cleanFile, '--json', '--daemon-url', stub.baseUrl]);
    expect(run.code).toBe(1);
    const envelope = JSON.parse(run.stdout);
    expect(envelope.ok).toBe(false);
    expect(envelope.failOn).toBe('p0');
    expect(envelope.counts).toEqual({ p0: 1, p1: 1, p2: 0 });
    expect(envelope.findings).toHaveLength(2);
    expect(envelope.agentMessage).toContain('<artifact-lint>');
  });

  it('appends the agent block to human output only with --agent-message', async () => {
    stub.setResponder(() => ({
      status: 200,
      body: { findings: [P0_FINDING], agentMessage: '<artifact-lint>block</artifact-lint>' },
    }));
    const withFlag = await runCli(['lint', cleanFile, '--agent-message', '--daemon-url', stub.baseUrl]);
    expect(withFlag.stdout).toContain('<artifact-lint>block</artifact-lint>');
    const withoutFlag = await runCli(['lint', cleanFile, '--daemon-url', stub.baseUrl]);
    expect(withoutFlag.stdout).not.toContain('<artifact-lint>');
  });

  it('exits 2 on usage errors: unknown flag, bad --fail-on, missing file, empty input', async () => {
    expect((await runCli(['lint', cleanFile, '--bogus', '--daemon-url', stub.baseUrl])).code).toBe(2);
    expect((await runCli(['lint', cleanFile, '--fail-on', 'p9', '--daemon-url', stub.baseUrl])).code).toBe(2);
    expect((await runCli(['lint'])).code).toBe(2);
    const missing = await runCli(['lint', join(fixtureDir, 'nope.html'), '--daemon-url', stub.baseUrl]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain('cannot read');
    const empty = join(fixtureDir, 'empty.html');
    writeFileSync(empty, '');
    const emptyRun = await runCli(['lint', empty, '--daemon-url', stub.baseUrl]);
    expect(emptyRun.code).toBe(2);
    expect(emptyRun.stderr).toContain('empty input');
  });

  it('surfaces an HTTP failure as a structured nonzero exit', async () => {
    stub.setResponder(() => ({ status: 500, body: { error: 'boom' } }));
    const run = await runCli(['lint', cleanFile, '--daemon-url', stub.baseUrl]);
    expect(run.code).toBe(64);
    expect(`${run.stdout}${run.stderr}`).toContain('boom');
  });

  it('exits 3 when the daemon is unreachable', async () => {
    const port = await reserveAndReleasePort();
    const run = await runCli(['lint', cleanFile, '--daemon-url', `http://127.0.0.1:${port}`]);
    expect(run.code).toBe(3);
  });

  it('is discoverable from the root help output', async () => {
    const run = await runCli(['--help']);
    expect(run.stdout).toContain('od lint <file.html|->');
    expect(run.stdout).toContain('--fail-on');
  });
});
