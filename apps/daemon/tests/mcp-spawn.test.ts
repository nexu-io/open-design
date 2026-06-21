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
  const oldClaudeBin = process.env.CLAUDE_BIN;
  const oldAgentHome = process.env.OD_AGENT_HOME;
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

async function waitForRunStatus(
  baseUrl: string,
  runId: string,
): Promise<{ status: string; error?: string | null; errorCode?: string | null }> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const r = await fetch(`${baseUrl}/api/runs/${runId}`);
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

describe('spawn writes external MCP config for Claude Code', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectsToClean: string[] = [];
  const tempDirs: string[] = [];

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
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function createProject(): Promise<{ id: string; dir: string; conversationId: string }> {
    const id = `mcp-spawn-${randomUUID()}`;
    const r = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: id }),
    });
    expect(r.ok).toBe(true);
    const body = (await r.json()) as { conversationId: string };
    projectsToClean.push(id);
    // The daemon owns its data dir; we discover the on-disk project path by
    // having the daemon return the upload root, then composing path manually.
    // Use the same path the daemon's `ensureProject` uses.
    const projectsBase = process.env.OD_DATA_DIR
      ? join(process.env.OD_DATA_DIR, 'projects')
      : join(process.cwd(), '.od', 'projects');
    return { id, dir: join(projectsBase, id), conversationId: body.conversationId };
  }

  async function importFolderProject(): Promise<{
    id: string;
    dir: string;
    externalDir: string;
    conversationId: string;
  }> {
    const externalDir = await fsp.mkdtemp(join(tmpdir(), 'od-mcp-import-'));
    tempDirs.push(externalDir);
    await fsp.writeFile(join(externalDir, 'index.html'), '<!doctype html>');
    const r = await fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseDir: externalDir }),
    });
    expect(r.ok).toBe(true);
    const body = (await r.json()) as { project: { id: string }; conversationId: string };
    projectsToClean.push(body.project.id);
    const projectsBase = process.env.OD_DATA_DIR
      ? join(process.env.OD_DATA_DIR, 'projects')
      : join(process.cwd(), '.od', 'projects');
    return {
      id: body.project.id,
      dir: join(projectsBase, body.project.id),
      externalDir,
      conversationId: body.conversationId,
    };
  }

  async function withSandboxMode<T>(run: () => Promise<T>): Promise<T> {
    const previous = process.env.OD_SANDBOX_MODE;
    process.env.OD_SANDBOX_MODE = '1';
    try {
      return await run();
    } finally {
      if (previous == null) delete process.env.OD_SANDBOX_MODE;
      else process.env.OD_SANDBOX_MODE = previous;
    }
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

  it('fails sandbox runs for imported-folder projects before writing MCP config', async () => {
    await withFakeClaude(async () => {
      const putRes = await fetch(`${baseUrl}/api/mcp/servers`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          servers: [
            {
              id: 'sandbox-run',
              transport: 'sse',
              enabled: true,
              url: 'https://mcp.example.test',
            },
          ],
        }),
      });
      expect(putRes.ok).toBe(true);

      const { id, dir, externalDir, conversationId } = await importFolderProject();

      await withSandboxMode(async () => {
        const chatRes = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            agentId: 'claude',
            projectId: id,
            message: 'hello sandbox mcp',
          }),
        });
        expect(chatRes.status).toBe(400);
        const body = (await chatRes.json()) as { error?: { message?: string } };
        expect(body.error?.message).toMatch(/imported-folder projects.*OD_SANDBOX_MODE/i);
      });

      const managedTarget = join(dir, '.mcp.json');
      expect(existsSync(managedTarget)).toBe(false);
      expect(existsSync(join(externalDir, '.mcp.json'))).toBe(false);
      const messagesRes = await fetch(
        `${baseUrl}/api/projects/${id}/conversations/${conversationId}/messages`,
      );
      expect(messagesRes.ok).toBe(true);
      const messagesBody = (await messagesRes.json()) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(messagesBody.messages.some((msg) => msg.content === 'hello sandbox mcp')).toBe(false);
    });
  }, 30_000);

  it('rejects sandbox routine reuse of imported-folder projects before creating run state', async () => {
    const { id } = await importFolderProject();
    const conversationsBeforeRes = await fetch(`${baseUrl}/api/projects/${id}/conversations`);
    expect(conversationsBeforeRes.ok).toBe(true);
    const conversationsBeforeBody = (await conversationsBeforeRes.json()) as {
      conversations: Array<{ id: string }>;
    };
    const conversationIdsBefore = conversationsBeforeBody.conversations.map((conversation) => conversation.id);

    let routineId: string | null = null;
    try {
      const createRoutineRes = await fetch(`${baseUrl}/api/routines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Sandbox imported folder routine',
          prompt: 'try to run inside an imported folder',
          schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
          target: { mode: 'reuse', projectId: id },
          agentId: 'claude',
          enabled: false,
        }),
      });
      expect(createRoutineRes.status).toBe(201);
      const createRoutineBody = (await createRoutineRes.json()) as {
        routine: { id: string };
      };
      routineId = createRoutineBody.routine.id;

      await withSandboxMode(async () => {
        const runRoutineRes = await fetch(`${baseUrl}/api/routines/${routineId}/run`, {
          method: 'POST',
        });
        expect(runRoutineRes.status).toBe(500);
        const runRoutineBody = (await runRoutineRes.json()) as { error?: string };
        expect(runRoutineBody.error).toMatch(/imported-folder projects.*OD_SANDBOX_MODE/i);
      });

      const routineRunsRes = await fetch(`${baseUrl}/api/routines/${routineId}/runs?limit=10`);
      expect(routineRunsRes.ok).toBe(true);
      const routineRunsBody = (await routineRunsRes.json()) as { runs: unknown[] };
      expect(routineRunsBody.runs).toHaveLength(0);

      const runsRes = await fetch(`${baseUrl}/api/runs?projectId=${encodeURIComponent(id)}`);
      expect(runsRes.ok).toBe(true);
      const runsBody = (await runsRes.json()) as { runs: unknown[] };
      expect(runsBody.runs).toHaveLength(0);

      const conversationsAfterRes = await fetch(`${baseUrl}/api/projects/${id}/conversations`);
      expect(conversationsAfterRes.ok).toBe(true);
      const conversationsAfterBody = (await conversationsAfterRes.json()) as {
        conversations: Array<{ id: string }>;
      };
      expect(conversationsAfterBody.conversations.map((conversation) => conversation.id)).toEqual(
        conversationIdsBefore,
      );
    } finally {
      if (routineId) {
        await fetch(`${baseUrl}/api/routines/${routineId}`, { method: 'DELETE' }).catch(() => {});
      }
    }
  }, 30_000);

  it('binds conversation-less runs to the seeded project conversation', async () => {
    await withFakeClaude(async () => {
      const { id, conversationId } = await createProject();
      const recentConvRes = await fetch(`${baseUrl}/api/projects/${id}/conversations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Recently active' }),
      });
      expect(recentConvRes.ok).toBe(true);
      const recentConvBody = (await recentConvRes.json()) as {
        conversation: { id: string };
      };
      const recentConversationId = recentConvBody.conversation.id;
      await fetch(`${baseUrl}/api/projects/${id}/conversations/${recentConversationId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Recently active',
          updatedAt: Date.now() + 60_000,
        }),
      });

      const chatRes = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: 'claude',
          projectId: id,
          message: 'headless fallback prompt',
        }),
      });
      expect(chatRes.status).toBe(202);
      const { runId, conversationId: resolvedConversationId } = (await chatRes.json()) as {
        runId: string;
        conversationId: string;
      };
      expect(resolvedConversationId).toBe(conversationId);
      const status = await waitForRunStatus(baseUrl, runId);
      expect(status.status).toBe('succeeded');

      const defaultMessagesRes = await fetch(
        `${baseUrl}/api/projects/${id}/conversations/${conversationId}/messages`,
      );
      expect(defaultMessagesRes.ok).toBe(true);
      const defaultMessages = (await defaultMessagesRes.json()) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(defaultMessages.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: 'headless fallback prompt',
          }),
        ]),
      );

      const recentMessagesRes = await fetch(
        `${baseUrl}/api/projects/${id}/conversations/${recentConversationId}/messages`,
      );
      expect(recentMessagesRes.ok).toBe(true);
      const recentMessages = (await recentMessagesRes.json()) as {
        messages: Array<{ content: string }>;
      };
      expect(recentMessages.messages.some((msg) => msg.content === 'headless fallback prompt')).toBe(false);
    });
  }, 30_000);

  it('injects run-scoped MCP servers without saving them to the persistent registry', async () => {
    await withFakeClaude(async () => {
      const { id, dir } = await createProject();

      const chatRes = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: 'claude',
          projectId: id,
          message: 'hello run-scoped mcp',
          toolBundle: {
            mcpServers: [
              {
                id: 'run-local',
                transport: 'stdio',
                command: 'node',
                args: ['run-tool.js'],
                env: { RUN_ONLY: '1' },
              },
              {
                id: 'run-remote',
                transport: 'http',
                enabled: true,
                authMode: 'none',
                url: 'https://example.test/mcp',
                headers: { 'X-Run': 'ok' },
              },
            ],
          },
        }),
      });
      expect(chatRes.status).toBe(202);
      const { runId } = (await chatRes.json()) as { runId: string };
      const status = await waitForRunStatus(baseUrl, runId) as {
        status: string;
        toolBundle?: { mcpServers?: Array<{ id: string }> };
      };
      expect(status.status).toBe('succeeded');
      expect(status.toolBundle?.mcpServers?.map((server) => server.id)).toEqual([
        'run-local',
        'run-remote',
      ]);

      const target = join(dir, '.mcp.json');
      expect(existsSync(target)).toBe(true);
      const written = JSON.parse(await fsp.readFile(target, 'utf8'));
      expect(written.mcpServers.run_local).toBeUndefined();
      expect(written.mcpServers['run-local']).toMatchObject({
        command: 'node',
        args: ['run-tool.js'],
        env: { RUN_ONLY: '1' },
      });
      expect(written.mcpServers['run-remote']).toMatchObject({
        type: 'http',
        url: 'https://example.test/mcp',
        headers: { 'X-Run': 'ok' },
      });

      const persistedRes = await fetch(`${baseUrl}/api/mcp/servers`);
      expect(persistedRes.ok).toBe(true);
      const persisted = (await persistedRes.json()) as { servers: unknown[] };
      expect(persisted.servers).toEqual([]);
    });
  }, 30_000);

  it('rejects Claude run-scoped MCP bundles for imported-folder projects', async () => {
    const { id, dir, externalDir, conversationId } = await importFolderProject();

    const runsRes = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'claude',
        projectId: id,
        message: 'imported run-scoped tools',
        toolBundle: {
          mcpServers: [
            {
              id: 'run-local',
              transport: 'stdio',
              command: 'node',
            },
          ],
        },
      }),
    });
    expect(runsRes.status).toBe(400);
    const runsBody = (await runsRes.json()) as { error?: { message?: string } };
    expect(runsBody.error?.message).toContain('toolBundle requires a daemon-managed project');

    const chatRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'claude',
        projectId: id,
        message: 'imported chat-scoped tools',
        toolBundle: {
          mcpServers: [
            {
              id: 'run-local-chat',
              transport: 'stdio',
              command: 'node',
            },
          ],
        },
      }),
    });
    expect(chatRes.status).toBe(400);
    const chatBody = (await chatRes.json()) as { error?: { message?: string } };
    expect(chatBody.error?.message).toContain('toolBundle requires a daemon-managed project');

    expect(existsSync(join(dir, '.mcp.json'))).toBe(false);
    expect(existsSync(join(externalDir, '.mcp.json'))).toBe(false);
    const messagesRes = await fetch(
      `${baseUrl}/api/projects/${id}/conversations/${conversationId}/messages`,
    );
    expect(messagesRes.ok).toBe(true);
    const messagesBody = (await messagesRes.json()) as {
      messages: Array<{ content: string }>;
    };
    expect(messagesBody.messages.some((msg) => msg.content === 'imported run-scoped tools')).toBe(false);
    expect(messagesBody.messages.some((msg) => msg.content === 'imported chat-scoped tools')).toBe(false);
  });

  it('rejects malformed run-scoped MCP bundles before creating runs', async () => {
    const { id } = await createProject();

    const invalidRunsRes = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'claude',
        projectId: id,
        message: 'bad tools',
        toolBundle: {
          mcpServers: [
            {
              id: 'missing-command',
              transport: 'stdio',
            },
          ],
        },
      }),
    });
    expect(invalidRunsRes.status).toBe(400);
    const runsBody = (await invalidRunsRes.json()) as { error?: { message?: string } };
    expect(runsBody.error?.message).toContain('toolBundle.mcpServers[0] is invalid');

    const invalidChatRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'claude',
        projectId: id,
        message: 'bad tools',
        toolBundle: 'bad',
      }),
    });
    expect(invalidChatRes.status).toBe(400);
    const chatBody = (await invalidChatRes.json()) as { error?: { message?: string } };
    expect(chatBody.error?.message).toContain('toolBundle must be an object');
  });

  it('rejects run-scoped MCP bundles the selected runtime cannot receive', async () => {
    const { id, conversationId } = await createProject();

    const unsupportedRuntimeRes = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'codex',
        projectId: id,
        message: 'bad tools',
        toolBundle: {
          mcpServers: [
            {
              id: 'run-local',
              transport: 'stdio',
              command: 'node',
            },
          ],
        },
      }),
    });
    expect(unsupportedRuntimeRes.status).toBe(400);
    const unsupportedRuntimeBody = (await unsupportedRuntimeRes.json()) as {
      error?: { message?: string };
    };
    expect(unsupportedRuntimeBody.error?.message).toContain(
      'Codex CLI (codex) does not support run-scoped MCP tool bundles',
    );
    const messagesRes = await fetch(
      `${baseUrl}/api/projects/${id}/conversations/${conversationId}/messages`,
    );
    expect(messagesRes.ok).toBe(true);
    const messagesBody = (await messagesRes.json()) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(messagesBody.messages.some((msg) => msg.content === 'bad tools')).toBe(false);

    const unsupportedTransportRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'hermes',
        projectId: id,
        message: 'bad remote tools',
        toolBundle: {
          mcpServers: [
            {
              id: 'run-remote',
              transport: 'http',
              url: 'https://example.test/mcp',
            },
          ],
        },
      }),
    });
    expect(unsupportedTransportRes.status).toBe(400);
    const unsupportedTransportBody = (await unsupportedTransportRes.json()) as {
      error?: { message?: string };
    };
    expect(unsupportedTransportBody.error?.message).toContain(
      'Hermes (hermes) only supports stdio run-scoped MCP servers',
    );
  });

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
