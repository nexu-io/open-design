// End-to-end test for the spawn-time `.mcp.json` write path.
//
// Configures an external MCP server via the same `/api/mcp/servers` endpoint
// the web UI uses, drives a chat run with a fake `claude` binary on PATH so
// we don't need a real install, and asserts that the daemon writes the
// project-cwd `.mcp.json` Claude Code auto-loads. Then disables the server
// and verifies the stale file is removed on the next run.
//
// Mirrors the `withFakeAgent` pattern used by chat-route.test.ts so the
// shape of the spawn (PATH override, fake exec, real /api/chat round-trip)
// matches what the daemon does in production.

import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, promises as fsp, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

async function withFakeClaude<T>(run: () => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(join(tmpdir(), 'od-mcp-spawn-bin-'));
  const oldPath = process.env.PATH;
  // Fake `claude` that prints stream-json the daemon understands and exits 0.
  // The single result frame is enough to drive the run to `succeeded`.
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
      const runner = join(dir, 'claude-test-runner.cjs');
      await fsp.writeFile(runner, script);
      await fsp.writeFile(
        join(dir, 'claude.cmd'),
        `@echo off\r\nnode "${runner}" %*\r\n`,
      );
    } else {
      const bin = join(dir, 'claude');
      await fsp.writeFile(bin, `#!/usr/bin/env node\n${script}`);
      await fsp.chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${delimiter}${oldPath ?? ''}`;
    return await run();
  } finally {
    process.env.PATH = oldPath;
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function waitForRunStatus(
  baseUrl: string,
  runId: string,
): Promise<{ status: string }> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const r = await fetch(`${baseUrl}/api/runs/${runId}`);
    const body = (await r.json()) as { status: string };
    if (body.status !== 'queued' && body.status !== 'running') return body;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('run did not finish');
}

describe('spawn writes external MCP config for Claude Code', () => {
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
  });

  afterAll(async () => {
    for (const id of projectsToClean.splice(0)) {
      await fetch(`${baseUrl}/api/projects/${id}`, { method: 'DELETE' }).catch(() => {});
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(async () => {
    // Always reset the global MCP servers list so test ordering doesn't matter.
    await fetch(`${baseUrl}/api/mcp/servers`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servers: [] }),
    }).catch(() => {});
  });

  async function createProject(): Promise<{ id: string; dir: string }> {
    const id = `mcp-spawn-${randomUUID()}`;
    const r = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: id }),
    });
    expect(r.ok).toBe(true);
    projectsToClean.push(id);
    // The daemon owns its data dir; we discover the on-disk project path by
    // having the daemon return the upload root, then composing path manually.
    // Use the same path the daemon's `ensureProject` uses.
    const projectsBase = process.env.OD_DATA_DIR
      ? join(process.env.OD_DATA_DIR, 'projects')
      : join(process.cwd(), '.od', 'projects');
    return { id, dir: join(projectsBase, id) };
  }

  it('writes .mcp.json into the per-project dir, then removes it when servers are cleared', async () => {
    await withFakeClaude(async () => {
      // Configure one enabled SSE server. URL gets normalized (trailing slash).
      const putRes = await fetch(`${baseUrl}/api/mcp/servers`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          servers: [
            {
              id: 'higgsfield',
              transport: 'sse',
              enabled: true,
              url: 'https://mcp.higgsfield.ai',
            },
          ],
        }),
      });
      expect(putRes.ok).toBe(true);

      const { id, dir } = await createProject();

      // Drive a chat run. The fake `claude` exits 0 immediately; what we care
      // about is the SIDE EFFECT — `.mcp.json` written to the project cwd
      // before the spawn.
      const chatRes = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: 'claude',
          projectId: id,
          message: 'hello mcp',
        }),
      });
      expect(chatRes.status).toBe(202);
      const { runId } = (await chatRes.json()) as { runId: string };
      await waitForRunStatus(baseUrl, runId);

      const target = join(dir, '.mcp.json');
      expect(existsSync(target)).toBe(true);
      const written = JSON.parse(await fsp.readFile(target, 'utf8'));
      expect(written.mcpServers).toBeDefined();
      expect(written.mcpServers.higgsfield).toMatchObject({
        type: 'sse',
        url: 'https://mcp.higgsfield.ai/',
      });

      // Clear the MCP config and run again. The stale .mcp.json must be
      // removed so a freshly-spawned agent doesn't see the old config.
      await fetch(`${baseUrl}/api/mcp/servers`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ servers: [] }),
      });

      const chat2 = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: 'claude',
          projectId: id,
          message: 'second turn',
        }),
      });
      expect(chat2.status).toBe(202);
      const { runId: runId2 } = (await chat2.json()) as { runId: string };
      await waitForRunStatus(baseUrl, runId2);

      expect(existsSync(target)).toBe(false);
    });
  }, 30_000);

  it('does not write .mcp.json for ACP agents (Hermes wires via session args)', async () => {
    // ACP agents (Hermes/Kimi) consume the `mcpServers` array via the ACP
    // session/new params instead of `.mcp.json`. The `.mcp.json` write path
    // is gated to `def.id === 'claude'`, so this test covers the negative
    // direction: configure servers, run a non-claude agent, no file written.
    const putRes = await fetch(`${baseUrl}/api/mcp/servers`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        servers: [
          {
            id: 'fs',
            transport: 'stdio',
            enabled: true,
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          },
        ],
      }),
    });
    expect(putRes.ok).toBe(true);

    const { id, dir } = await createProject();
    // Trigger any non-claude agent — it'll fail to spawn (no fake binary) but
    // the .mcp.json write gate runs BEFORE bin resolution, so the absence of
    // the file is the assertion that the gate held.
    await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'hermes',
        projectId: id,
        message: 'hi',
      }),
    });
    // Give the run a moment to reach the spawn pre-flight.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const target = join(dir, '.mcp.json');
    expect(existsSync(target)).toBe(false);
  }, 15_000);
});
