import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = {
  url: string;
  server: http.Server;
  shutdown?: () => Promise<void> | void;
};

describe('POST /api/runs headless fallbacks', () => {
  let started: StartedServer | null = null;
  const oldPath = process.env.PATH;
  const oldAgentHome = process.env.OD_AGENT_HOME;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    if (oldAgentHome === undefined) delete process.env.OD_AGENT_HOME;
    else process.env.OD_AGENT_HOME = oldAgentHome;
  });

  it('binds omitted conversationId to the seeded project conversation', async () => {
    started = await startTestServer();
    const { projectId, conversationId: seededConversationId } = await createProject(
      started.url,
      'Headless default conversation project',
    );
    await delay(5);
    const newerConversationId = await createConversation(started.url, projectId, 'Newer user chat');

    const conversationsResponse = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations`,
    );
    expect(conversationsResponse.status).toBe(200);
    const conversationsBody = await conversationsResponse.json() as {
      conversations: Array<{ id: string }>;
    };
    expect(conversationsBody.conversations[0]?.id).toBe(newerConversationId);

    const runResponse = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId,
        message: 'Headless prompt',
      }),
    });
    expect(runResponse.status).toBe(202);
    const runBody = await runResponse.json() as { conversationId: string | null };
    expect(runBody.conversationId).toBe(seededConversationId);
  });

  it('falls back past a stale saved agent to the first detected available runtime', async () => {
    started = await startTestServer();
    const binDir = await mkdtemp(path.join(os.tmpdir(), 'od-headless-run-bin-'));
    const emptyAgentHome = await mkdtemp(path.join(os.tmpdir(), 'od-headless-run-home-'));
    const priorConfig = await readAppConfigFromServer(started.url);
    try {
      const opencodeBin = await writeFakeOpencode(binDir);
      process.env.PATH = '';
      process.env.OD_AGENT_HOME = emptyAgentHome;

      const configResponse = await fetch(`${started.url}/api/app-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'claude',
          agentCliEnv: {
            claude: { CLAUDE_BIN: path.join(binDir, 'missing-claude') },
            opencode: { OPENCODE_BIN: opencodeBin },
          },
        }),
      });
      expect(configResponse.status).toBe(200);

      const { projectId } = await createProject(started.url, 'Headless stale agent project');
      const runResponse = await fetch(`${started.url}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          message: 'Headless prompt',
        }),
      });
      expect(runResponse.status).toBe(202);
      const runBody = await runResponse.json() as { runId: string };
      const statusResponse = await fetch(
        `${started.url}/api/runs/${encodeURIComponent(runBody.runId)}`,
      );
      expect(statusResponse.status).toBe(200);
      const statusBody = await statusResponse.json() as { agentId: string | null };
      expect(statusBody.agentId).toBe('opencode');
    } finally {
      await restoreAppConfig(started.url, priorConfig);
      await rm(binDir, { recursive: true, force: true });
      await rm(emptyAgentHome, { recursive: true, force: true });
    }
  });
});

async function startTestServer(): Promise<StartedServer> {
  return await startServer({ port: 0, returnServer: true }) as StartedServer;
}

async function createProject(url: string, name: string): Promise<{
  projectId: string;
  conversationId: string;
}> {
  const projectId = `project_${randomUUID()}`;
  const response = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name,
      metadata: { kind: 'prototype' },
    }),
  });
  expect(response.status).toBe(200);
  const body = await response.json() as { conversationId: string };
  return { projectId, conversationId: body.conversationId };
}

async function createConversation(
  url: string,
  projectId: string,
  title: string,
): Promise<string> {
  const response = await fetch(`${url}/api/projects/${encodeURIComponent(projectId)}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  expect(response.status).toBe(200);
  const body = await response.json() as { conversation: { id: string } };
  return body.conversation.id;
}

async function readAppConfigFromServer(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${url}/api/app-config`);
  expect(response.status).toBe(200);
  const body = await response.json() as { config?: Record<string, unknown> };
  return body.config ?? {};
}

async function restoreAppConfig(url: string, config: Record<string, unknown>): Promise<void> {
  await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: Object.hasOwn(config, 'agentId') ? config.agentId : null,
      agentCliEnv: Object.hasOwn(config, 'agentCliEnv') ? config.agentCliEnv : null,
    }),
  });
}

async function writeFakeOpencode(dir: string): Promise<string> {
  const bin = path.join(dir, 'opencode');
  await writeFile(bin, `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('opencode 0.0.0');
  process.exit(0);
}
if (process.argv[2] === 'models') {
  console.log('test/model');
  process.exit(0);
}
if (process.argv[2] === 'run') {
  process.stdin.resume();
  process.stdin.on('end', () => process.exit(0));
  setTimeout(() => process.exit(0), 50);
} else {
  process.exit(0);
}
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
