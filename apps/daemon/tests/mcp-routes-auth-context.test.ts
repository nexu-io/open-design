import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_TRUSTED_EMAIL_HEADER } from '../src/auth-context.js';
import { openDatabase } from '../src/db.js';
import { setToken } from '../src/mcp-tokens.js';
import { startServer } from '../src/server.js';

interface StartedServer {
  url: string;
  server: http.Server;
}

interface McpServersBody {
  servers: Array<{ id: string; url?: string }>;
  templates?: unknown[];
}

interface InstallInfoBody {
  env?: Record<string, string>;
}

interface OAuthStatusBody {
  connected: boolean;
  expiresAt?: number | null;
  scope?: string | null;
  savedAt?: number;
}

const dataDir = process.env.OD_DATA_DIR as string;

async function withFakeClaude<T>(run: () => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(path.join(tmpdir(), 'od-mcp-auth-bin-'));
  const oldPath = process.env.PATH;
  const oldClaudeBin = process.env.CLAUDE_BIN;
  const oldAgentHome = process.env.OD_AGENT_HOME;
  const script = `
const out = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  duration_ms: 1,
  total_cost_usd: 0,
  usage: { input_tokens: 1, output_tokens: 1 },
  result: 'ok',
};
console.log(JSON.stringify(out));
process.exit(0);
`;
  try {
    if (process.platform === 'win32') {
      const runner = path.join(dir, 'claude-test-runner.cjs');
      await fsp.writeFile(runner, script);
      await fsp.writeFile(
        path.join(dir, 'claude.cmd'),
        `@echo off\r\nnode "${runner}" %*\r\n`,
      );
    } else {
      const bin = path.join(dir, 'claude');
      await fsp.writeFile(bin, `#!/usr/bin/env node\n${script}`);
      await fsp.chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${delimiter}${oldPath ?? ''}`;
    delete process.env.CLAUDE_BIN;
    process.env.OD_AGENT_HOME = dir;
    return await run();
  } finally {
    process.env.PATH = oldPath;
    if (oldClaudeBin === undefined) delete process.env.CLAUDE_BIN;
    else process.env.CLAUDE_BIN = oldClaudeBin;
    if (oldAgentHome === undefined) delete process.env.OD_AGENT_HOME;
    else process.env.OD_AGENT_HOME = oldAgentHome;
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function withAppConfigOnlyFakeClaude<T>(run: (claudeBin: string) => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(path.join(tmpdir(), 'od-run-auth-bin-'));
  const oldPath = process.env.PATH;
  const oldClaudeBin = process.env.CLAUDE_BIN;
  const oldAgentHome = process.env.OD_AGENT_HOME;
  const claudeBin = path.join(dir, 'claude');
  const script = `
if (process.argv.includes('--version')) {
  console.log('claude-code 0.0.0');
  process.exit(0);
}
const out = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  duration_ms: 1,
  total_cost_usd: 0,
  usage: { input_tokens: 1, output_tokens: 1 },
  result: 'ok',
};
console.log(JSON.stringify(out));
process.exit(0);
`;
  try {
    await fsp.writeFile(claudeBin, `#!${process.execPath}\n${script}`);
    await fsp.chmod(claudeBin, 0o755);
    process.env.PATH = '';
    delete process.env.CLAUDE_BIN;
    process.env.OD_AGENT_HOME = dir;
    return await run(claudeBin);
  } finally {
    process.env.PATH = oldPath;
    if (oldClaudeBin === undefined) delete process.env.CLAUDE_BIN;
    else process.env.CLAUDE_BIN = oldClaudeBin;
    if (oldAgentHome === undefined) delete process.env.OD_AGENT_HOME;
    else process.env.OD_AGENT_HOME = oldAgentHome;
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function waitForRunStatus(
  baseUrl: string,
  runId: string,
  headers: Record<string, string>,
): Promise<{ status: string; error?: string | null; errorCode?: string | null }> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const r = await fetch(`${baseUrl}/api/runs/${runId}`, { headers });
    const body = (await r.json()) as {
      status: string;
      error?: string | null;
      errorCode?: string | null;
    };
    if (body.status !== 'queued' && body.status !== 'running') return body;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('run did not finish within 5s of polling');
}

function authHeaders(email: string): Record<string, string> {
  return { [DEFAULT_TRUSTED_EMAIL_HEADER]: email };
}

function jsonAuthHeaders(email: string): Record<string, string> {
  return {
    ...authHeaders(email),
    'content-type': 'application/json',
  };
}

describe('mcp routes auth context', () => {
  let server: http.Server;
  let baseUrl: string;
  let originalMultitenant: string | undefined;
  const projectsToClean: Array<{ email: string; id: string }> = [];

  beforeAll(async () => {
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    originalMultitenant = process.env.OD_MULTITENANT;
    process.env.OD_MULTITENANT = '1';
    const started = (await startServer({
      port: 0,
      returnServer: true,
    })) as StartedServer;
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    for (const project of projectsToClean.splice(0)) {
      await fetch(`${baseUrl}/api/projects/${project.id}`, {
        method: 'DELETE',
        headers: authHeaders(project.email),
      }).catch(() => {});
    }
    if (originalMultitenant === undefined) delete process.env.OD_MULTITENANT;
    else process.env.OD_MULTITENANT = originalMultitenant;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await fsp.rm(path.join(dataDir, 'users'), { recursive: true, force: true });
    await fsp.rm(path.join(dataDir, 'mcp-config.json'), { force: true });
    await fsp.rm(path.join(dataDir, 'mcp-tokens.json'), { force: true });
  });

  async function putServers(email: string, servers: unknown[]): Promise<Response> {
    return fetch(`${baseUrl}/api/mcp/servers`, {
      method: 'PUT',
      headers: jsonAuthHeaders(email),
      body: JSON.stringify({ servers }),
    });
  }

  async function getServers(email: string): Promise<McpServersBody> {
    const res = await fetch(`${baseUrl}/api/mcp/servers`, {
      headers: authHeaders(email),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as McpServersBody;
  }

  async function getInstallDataDir(email: string): Promise<string> {
    const res = await fetch(`${baseUrl}/api/mcp/install-info`, {
      headers: authHeaders(email),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as InstallInfoBody;
    const scopedDataDir = body.env?.OD_DATA_DIR;
    expect(scopedDataDir).toBeTruthy();
    return scopedDataDir!;
  }

  it('requires a tenant identity in multitenant mode', async () => {
    const res = await fetch(`${baseUrl}/api/mcp/servers`);
    expect(res.status).toBe(401);
  });

  it('stores MCP server config separately for each authenticated user', async () => {
    const alicePut = await putServers('alice@example.com', [
      {
        id: 'alice-design-mcp',
        transport: 'sse',
        enabled: true,
        url: 'https://alice.example.test/mcp',
      },
    ]);
    expect(alicePut.status).toBe(200);

    const bobPut = await putServers('bob@example.com', [
      {
        id: 'bob-design-mcp',
        transport: 'sse',
        enabled: true,
        url: 'https://bob.example.test/mcp',
      },
    ]);
    expect(bobPut.status).toBe(200);

    const alice = await getServers('alice@example.com');
    expect(alice.servers.map((serverConfig) => serverConfig.id)).toEqual([
      'alice-design-mcp',
    ]);

    const bob = await getServers('bob@example.com');
    expect(bob.servers.map((serverConfig) => serverConfig.id)).toEqual([
      'bob-design-mcp',
    ]);

    const aliceDataDir = await getInstallDataDir('alice@example.com');
    const bobDataDir = await getInstallDataDir('bob@example.com');
    expect(aliceDataDir).not.toBe(bobDataDir);
    expect(aliceDataDir).toContain(`${path.sep}users${path.sep}`);
    expect(bobDataDir).toContain(`${path.sep}users${path.sep}`);
  });

  it('scopes MCP OAuth token status to the authenticated user', async () => {
    const aliceDataDir = await getInstallDataDir('alice@example.com');
    await setToken(aliceDataDir, 'figma', {
      accessToken: 'alice-token',
      tokenType: 'Bearer',
      scope: 'mcp:tools',
      savedAt: Date.now(),
    });

    const aliceStatusRes = await fetch(
      `${baseUrl}/api/mcp/oauth/status?serverId=figma`,
      { headers: authHeaders('alice@example.com') },
    );
    expect(aliceStatusRes.status).toBe(200);
    const aliceStatus = (await aliceStatusRes.json()) as OAuthStatusBody;
    expect(aliceStatus).toMatchObject({
      connected: true,
      scope: 'mcp:tools',
    });

    const bobStatusRes = await fetch(
      `${baseUrl}/api/mcp/oauth/status?serverId=figma`,
      { headers: authHeaders('bob@example.com') },
    );
    expect(bobStatusRes.status).toBe(200);
    const bobStatus = (await bobStatusRes.json()) as OAuthStatusBody;
    expect(bobStatus).toEqual({ connected: false });
  });

  it('uses the authenticated user MCP config when spawning a chat run', async () => {
    await withFakeClaude(async () => {
      const aliceEmail = 'alice@example.com';
      const bobEmail = 'bob@example.com';

      const alicePut = await putServers(aliceEmail, [
        {
          id: 'alice-runtime-mcp',
          transport: 'sse',
          enabled: true,
          url: 'https://alice-runtime.example.test/mcp',
        },
      ]);
      expect(alicePut.status).toBe(200);

      const bobPut = await putServers(bobEmail, [
        {
          id: 'bob-runtime-mcp',
          transport: 'sse',
          enabled: true,
          url: 'https://bob-runtime.example.test/mcp',
        },
      ]);
      expect(bobPut.status).toBe(200);

      const projectId = `mcp-auth-${randomUUID()}`;
      const createProjectRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: jsonAuthHeaders(aliceEmail),
        body: JSON.stringify({ id: projectId, name: projectId }),
      });
      expect(createProjectRes.ok).toBe(true);
      projectsToClean.push({ email: aliceEmail, id: projectId });

      const aliceDataDir = await getInstallDataDir(aliceEmail);
      const projectDir = path.join(aliceDataDir, 'projects', projectId);

      const chatRes = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: jsonAuthHeaders(aliceEmail),
        body: JSON.stringify({
          agentId: 'claude',
          projectId,
          message: 'hello alice mcp',
        }),
      });
      expect(chatRes.status).toBe(202);
      const { runId } = (await chatRes.json()) as { runId: string };
      const status = await waitForRunStatus(baseUrl, runId, authHeaders(aliceEmail));
      expect(status.status).toBe('succeeded');

      const target = path.join(projectDir, '.mcp.json');
      expect(existsSync(target)).toBe(true);
      const written = JSON.parse(await fsp.readFile(target, 'utf8')) as {
        mcpServers?: Record<string, { url?: string }>;
      };
      expect(written.mcpServers?.['alice-runtime-mcp']).toMatchObject({
        url: 'https://alice-runtime.example.test/mcp',
      });
      expect(written.mcpServers?.['bob-runtime-mcp']).toBeUndefined();
    });
  }, 30_000);

  it('uses the authenticated user app config when resolving an omitted run agent', async () => {
    await withAppConfigOnlyFakeClaude(async (claudeBin) => {
      const aliceEmail = 'alice@example.com';

      const configRes = await fetch(`${baseUrl}/api/app-config`, {
        method: 'PUT',
        headers: jsonAuthHeaders(aliceEmail),
        body: JSON.stringify({
          agentId: 'claude',
          agentCliEnv: { claude: { CLAUDE_BIN: claudeBin } },
        }),
      });
      expect(configRes.status).toBe(200);

      const projectId = `run-auth-${randomUUID()}`;
      const createProjectRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: jsonAuthHeaders(aliceEmail),
        body: JSON.stringify({ id: projectId, name: projectId }),
      });
      expect(createProjectRes.ok).toBe(true);
      projectsToClean.push({ email: aliceEmail, id: projectId });

      const runRes = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: jsonAuthHeaders(aliceEmail),
        body: JSON.stringify({
          projectId,
          message: 'use alice app config agent',
        }),
      });
      expect(runRes.status).toBe(202);
      const { runId } = (await runRes.json()) as { runId: string };
      const status = await waitForRunStatus(baseUrl, runId, authHeaders(aliceEmail));
      expect(status.status).toBe('succeeded');

      const runStatusRes = await fetch(`${baseUrl}/api/runs/${runId}`, {
        headers: authHeaders(aliceEmail),
      });
      expect(runStatusRes.status).toBe(200);
      const runStatus = (await runStatusRes.json()) as { agentId?: string | null };
      expect(runStatus.agentId).toBe('claude');
    });
  }, 30_000);

  it('scopes run create, list, status, and cancel routes to the authenticated project owner', async () => {
    await withFakeClaude(async () => {
      const aliceEmail = 'alice@example.com';
      const bobEmail = 'bob@example.com';
      const projectId = `run-owner-alice-${randomUUID()}`;

      const createProjectRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: jsonAuthHeaders(aliceEmail),
        body: JSON.stringify({ id: projectId, name: projectId }),
      });
      expect(createProjectRes.status).toBe(200);
      projectsToClean.push({ email: aliceEmail, id: projectId });

      const aliceRunRes = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: jsonAuthHeaders(aliceEmail),
        body: JSON.stringify({
          agentId: 'claude',
          projectId,
          message: 'visible only to Alice',
        }),
      });
      expect(aliceRunRes.status).toBe(202);
      const { runId } = (await aliceRunRes.json()) as { runId: string };

      const bobRunRes = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: jsonAuthHeaders(bobEmail),
        body: JSON.stringify({
          agentId: 'claude',
          projectId,
          message: 'should not start',
        }),
      });
      expect(bobRunRes.status).toBe(404);

      const bobChatRes = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: jsonAuthHeaders(bobEmail),
        body: JSON.stringify({
          agentId: 'claude',
          projectId,
          message: 'should not stream',
        }),
      });
      expect(bobChatRes.status).toBe(404);

      const bobListRes = await fetch(`${baseUrl}/api/runs?projectId=${encodeURIComponent(projectId)}`, {
        headers: authHeaders(bobEmail),
      });
      expect(bobListRes.status).toBe(200);
      const bobList = (await bobListRes.json()) as { runs: unknown[] };
      expect(bobList.runs).toEqual([]);

      const bobStatusRes = await fetch(`${baseUrl}/api/runs/${runId}`, {
        headers: authHeaders(bobEmail),
      });
      expect(bobStatusRes.status).toBe(404);

      const bobEventsRes = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
        headers: authHeaders(bobEmail),
      });
      expect(bobEventsRes.status).toBe(404);

      const bobAguiRes = await fetch(`${baseUrl}/api/runs/${runId}/agui`, {
        headers: authHeaders(bobEmail),
      });
      expect(bobAguiRes.status).toBe(404);

      const bobCancelRes = await fetch(`${baseUrl}/api/runs/${runId}/cancel`, {
        method: 'POST',
        headers: authHeaders(bobEmail),
      });
      expect(bobCancelRes.status).toBe(404);

      const aliceStatusRes = await fetch(`${baseUrl}/api/runs/${runId}`, {
        headers: authHeaders(aliceEmail),
      });
      expect(aliceStatusRes.status).toBe(200);

      const aliceDeleteProjectRes = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: authHeaders(aliceEmail),
      });
      expect(aliceDeleteProjectRes.status).toBe(200);
      const projectCleanupIndex = projectsToClean.findIndex((project) => project.id === projectId);
      if (projectCleanupIndex >= 0) projectsToClean.splice(projectCleanupIndex, 1);

      const db = openDatabase(process.cwd(), { dataDir });
      db.pragma('foreign_keys = OFF');
      db.prepare(
        `INSERT INTO genui_surfaces (
           id, project_id, conversation_id, run_id, plugin_snapshot_id,
           surface_id, kind, persist, schema_digest, value_json, status,
           responded_by, requested_at, responded_at, expires_at
         ) VALUES (?, ?, NULL, ?, ?, ?, 'confirmation', 'run', NULL, NULL,
                   'pending', NULL, ?, NULL, NULL)`,
      ).run(
        `surface-${randomUUID()}`,
        projectId,
        runId,
        `snapshot-${randomUUID()}`,
        'tenant-confirmation',
        Date.now(),
      );
      db.pragma('foreign_keys = ON');

      const bobListAfterDeleteRes = await fetch(`${baseUrl}/api/runs`, {
        headers: authHeaders(bobEmail),
      });
      expect(bobListAfterDeleteRes.status).toBe(200);
      const bobListAfterDelete = (await bobListAfterDeleteRes.json()) as {
        runs: Array<{ id: string }>;
      };
      expect(bobListAfterDelete.runs.map((run) => run.id)).not.toContain(runId);

      const bobStatusAfterDeleteRes = await fetch(`${baseUrl}/api/runs/${runId}`, {
        headers: authHeaders(bobEmail),
      });
      expect(bobStatusAfterDeleteRes.status).toBe(404);

      const bobEventsAfterDeleteRes = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
        headers: authHeaders(bobEmail),
      });
      expect(bobEventsAfterDeleteRes.status).toBe(404);

      const bobCancelAfterDeleteRes = await fetch(`${baseUrl}/api/runs/${runId}/cancel`, {
        method: 'POST',
        headers: authHeaders(bobEmail),
      });
      expect(bobCancelAfterDeleteRes.status).toBe(404);

      const bobGenuiAfterDeleteRes = await fetch(
        `${baseUrl}/api/runs/${runId}/genui/tenant-confirmation`,
        { headers: authHeaders(bobEmail) },
      );
      expect(bobGenuiAfterDeleteRes.status).toBe(404);

      const bobGenuiRespondAfterDeleteRes = await fetch(
        `${baseUrl}/api/runs/${runId}/genui/tenant-confirmation/respond`,
        {
          method: 'POST',
          headers: jsonAuthHeaders(bobEmail),
          body: JSON.stringify({ value: true }),
        },
      );
      expect(bobGenuiRespondAfterDeleteRes.status).toBe(404);

      const aliceStatusAfterDeleteRes = await fetch(`${baseUrl}/api/runs/${runId}`, {
        headers: authHeaders(aliceEmail),
      });
      expect(aliceStatusAfterDeleteRes.status).toBe(200);

      const aliceGenuiAfterDeleteRes = await fetch(
        `${baseUrl}/api/runs/${runId}/genui/tenant-confirmation`,
        { headers: authHeaders(aliceEmail) },
      );
      expect(aliceGenuiAfterDeleteRes.status).toBe(200);

      const aliceGenuiRespondAfterDeleteRes = await fetch(
        `${baseUrl}/api/runs/${runId}/genui/tenant-confirmation/respond`,
        {
          method: 'POST',
          headers: jsonAuthHeaders(aliceEmail),
          body: JSON.stringify({ value: true }),
        },
      );
      expect(aliceGenuiRespondAfterDeleteRes.status).toBe(200);
    });
  }, 30_000);
});
