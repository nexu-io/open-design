// Wiring test for the ACP stdio-MCP guard.
//
// Kimi Code CLI 0.37.0+ throws out of `session/new` when the request carries a
// stdio MCP server, so the assertion that matters is about the payload that
// actually reaches the wire — not about what a helper returns. This test puts a
// fake `kimi` on PATH that records every `session/new` params object it is
// given, drives a real `/api/runs` turn, and inspects the recording.
//
// Mirrors the withFakeAgent/PATH-override pattern used by mcp-spawn.test.ts so
// the spawn shape matches production.

import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

const FIXTURE = fileURLToPath(
  new URL('./fixtures/fake-kimi-acp-cli.mjs', import.meta.url),
);

interface SessionNewParams {
  cwd?: string;
  mcpServers?: Array<{ name?: string; type?: string; command?: string }>;
}

interface FakeAgentOptions {
  /** Version reported by `--version` (what agent detection caches). */
  version: string;
  /** Version reported in the ACP `initialize` result's `agentInfo`. */
  acpVersion?: string;
  binName?: string;
}

async function withFakeKimi<T>(
  options: FakeAgentOptions,
  run: (ctx: { sessionNewLog: string }) => Promise<T>,
): Promise<T> {
  const dir = await fsp.mkdtemp(join(tmpdir(), 'od-kimi-acp-bin-'));
  const sessionNewLog = join(dir, 'session-new.jsonl');
  const saved = {
    PATH: process.env.PATH,
    FAKE_KIMI_VERSION: process.env.FAKE_KIMI_VERSION,
    FAKE_KIMI_ACP_VERSION: process.env.FAKE_KIMI_ACP_VERSION,
    FAKE_KIMI_SESSION_NEW_LOG: process.env.FAKE_KIMI_SESSION_NEW_LOG,
  };
  try {
    const bin = join(dir, options.binName ?? 'kimi');
    await fsp.writeFile(bin, `#!/usr/bin/env node\nimport(${JSON.stringify(FIXTURE)});\n`);
    await fsp.chmod(bin, 0o755);
    process.env.PATH = `${dir}${delimiter}${saved.PATH ?? ''}`;
    process.env.FAKE_KIMI_VERSION = options.version;
    if (options.acpVersion === undefined) delete process.env.FAKE_KIMI_ACP_VERSION;
    else process.env.FAKE_KIMI_ACP_VERSION = options.acpVersion;
    process.env.FAKE_KIMI_SESSION_NEW_LOG = sessionNewLog;
    return await run({ sessionNewLog });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function readSessionNewParams(logPath: string): Promise<SessionNewParams[]> {
  if (!existsSync(logPath)) return [];
  const text = await fsp.readFile(logPath, 'utf8');
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as SessionNewParams);
}

async function waitForRunStatus(baseUrl: string, runId: string): Promise<string> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const r = await fetch(`${baseUrl}/api/runs/${runId}`);
    const body = (await r.json()) as { status: string };
    if (body.status !== 'queued' && body.status !== 'running') return body.status;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('run did not finish within 10s of polling');
}

function stdioEntriesOf(params: SessionNewParams) {
  // ACP treats a missing `type` as stdio; Kimi 0.37+ rejects both spellings.
  return (params.mcpServers ?? []).filter(
    (s) => s.type === undefined || s.type === null || s.type === 'stdio',
  );
}

describe('ACP stdio MCP servers are withheld from runtimes that reject them', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectsToClean: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    // startServer() warms detectAgents() in the background. Let that pass
    // settle before any test installs its own fake `kimi`.
    await fetch(`${baseUrl}/api/agents`).catch(() => {});
  });

  // Best-effort cleanup against a throwaway data dir. Deleting serially inside
  // the default 10s hook budget times out once this file shares a worker with
  // other server-level suites, so fan the deletes out and give the hook room —
  // a slow teardown must not report as a test failure when every case passed.
  afterAll(async () => {
    await Promise.all(
      projectsToClean.splice(0).map((id) =>
        fetch(`${baseUrl}/api/projects/${id}`, { method: 'DELETE' }).catch(() => {}),
      ),
    );
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }, 60_000);

  afterEach(async () => {
    await fetch(`${baseUrl}/api/mcp/servers`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servers: [] }),
    }).catch(() => {});
  });

  async function createProject(): Promise<{ id: string; dir: string }> {
    const id = `kimi-acp-${randomUUID()}`;
    const r = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: id }),
    });
    expect(r.ok).toBe(true);
    await r.json();
    projectsToClean.push(id);
    const projectsBase = process.env.OD_DATA_DIR
      ? join(process.env.OD_DATA_DIR, 'projects')
      : join(process.cwd(), '.od', 'projects');
    return { id, dir: join(projectsBase, id) };
  }

  async function runTurnAndReadSessionNew(
    options: FakeAgentOptions & { agentId?: string },
  ): Promise<{ params: SessionNewParams; status: string }> {
    const agentId = options.agentId ?? 'kimi';
    return withFakeKimi(options, async ({ sessionNewLog }) => {
      // Make the daemon aware of the fake binary now on PATH so the run is
      // allowed to start. The guard itself does not read this result.
      await fetch(`${baseUrl}/api/agents`).catch(() => {});
      const { id, dir } = await createProject();
      const res = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId, projectId: id, message: 'hello kimi' }),
      });
      expect(res.status).toBe(202);
      const { runId } = (await res.json()) as { runId: string };
      const status = await waitForRunStatus(baseUrl, runId);

      // Model detection also opens a session, but from the daemon's own cwd.
      // The run's session/new is the one anchored at the project dir.
      const all = await readSessionNewParams(sessionNewLog);
      const forRun = all.filter((p) => typeof p.cwd === 'string' && p.cwd.includes(dir));
      expect(
        forRun.length,
        `expected a session/new for the project cwd; saw ${JSON.stringify(all.map((p) => p.cwd))}`,
      ).toBeGreaterThan(0);
      return { params: forRun[forRun.length - 1]!, status };
    });
  }

  it('sends no stdio MCP server to Kimi 0.38.0, whose session/new rejects them', async () => {
    const { params } = await runTurnAndReadSessionNew({ version: '0.38.0' });
    const stdio = stdioEntriesOf(params);
    expect(
      stdio,
      `session/new carried stdio MCP servers Kimi 0.38.0 throws on: ${JSON.stringify(stdio)}`,
    ).toEqual([]);
  }, 60_000);

  it('sends no stdio MCP server to Kimi 0.37.0, the first rejecting build', async () => {
    const { params } = await runTurnAndReadSessionNew({ version: '0.37.0' });
    expect(stdioEntriesOf(params)).toEqual([]);
  }, 60_000);

  it('still sends the live-artifacts stdio MCP server to Kimi 0.36.1', async () => {
    const { params } = await runTurnAndReadSessionNew({ version: '0.36.1' });
    const names = (params.mcpServers ?? []).map((s) => s.name);
    expect(names).toContain('open-design-live-artifacts');
  }, 60_000);

  it('trusts the version the agent reports in the ACP handshake, not the `--version` probe', async () => {
    // The handshake is the authoritative signal: it is the build that is
    // actually about to parse `session/new`. A stale/misreporting `--version`
    // (upgrade between probe and run, PATH shim, cache refresh window) must not
    // be able to talk the daemon into sending a payload this build throws on.
    const { params } = await runTurnAndReadSessionNew({
      version: '0.36.1',
      acpVersion: '0.38.0',
    });
    expect(stdioEntriesOf(params)).toEqual([]);
  }, 60_000);

  it('also withholds a user-configured external stdio MCP server on Kimi 0.38.0', async () => {
    // `acp-merge` is the second producer of stdio entries; one of these alone
    // is enough to make Kimi 0.38.0 throw out of session/new.
    const put = await fetch(`${baseUrl}/api/mcp/servers`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        servers: [
          {
            id: 'user-stdio-server',
            transport: 'stdio',
            enabled: true,
            command: 'echo',
            args: ['hi'],
          },
        ],
      }),
    });
    expect(put.ok).toBe(true);

    const { params } = await runTurnAndReadSessionNew({ version: '0.38.0' });
    const names = (params.mcpServers ?? []).map((s) => s.name);
    expect(names).not.toContain('user-stdio-server');
    expect(names).not.toContain('open-design-live-artifacts');
  }, 60_000);

  it('leaves another mature-acp runtime (hermes) receiving its stdio MCP server', async () => {
    // Regression guard: the fix is scoped to Kimi, so hermes/trae-cli/reasonix
    // must keep the payload they have today — including at a version string
    // that would disqualify Kimi.
    const { params } = await runTurnAndReadSessionNew({
      version: '0.38.0',
      agentId: 'hermes',
      binName: 'hermes',
    });
    const names = (params.mcpServers ?? []).map((s) => s.name);
    expect(names).toContain('open-design-live-artifacts');
  }, 60_000);
});
