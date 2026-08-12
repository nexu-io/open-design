import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  status: string;
  error: string | null;
  errorCode: string | null;
};

type RunIdentity = {
  projectId: string;
  conversationId: string;
  workspaceId: string;
  workspaceMemberId: string;
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_STANDARD_ACP = path.join(HERE, 'fixtures', 'fake-standard-acp.ts');

describe('standard ACP session resume — full server cycle', () => {
  let started: StartedServer | null = null;
  let binDir: string | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
  });

  it('retains the stored session when non-stale ACP load failure stderr resembles a Claude resume miss', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-standard-acp-resume-'));
    const invocationLog = path.join(binDir, 'invocations.jsonl');
    const bin = await writeAgentWrapper(binDir, invocationLog);

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, bin);
    const identity = await createConversation(started.url);

    const first = await sendRunAndWait(started.url, identity, 'first request');
    expect(first.status).toBe('succeeded');

    // The structured load error is MCP-specific and therefore does not
    // authorize clearing the session. The generic stderr phrase deliberately
    // resembles Claude's missing-session output and must not override ACP.
    const second = await sendRunAndWait(started.url, identity, 'second request');
    expect(second.status).toBe('succeeded');

    // The retry proves the durable handle survived the failed load: it retries
    // session/load and succeeds. Incorrect stale-session classification clears
    // the handle and produces new -> load -> new instead.
    expect(await readInvocations(invocationLog)).toEqual(['new', 'load', 'load']);
  });
});

async function writeAgentWrapper(dir: string, invocationLog: string): Promise<string> {
  const bin = path.join(dir, 'hermes');
  const lines = [
    '#!/bin/sh',
    `export FAKE_STANDARD_ACP_INVOCATION_LOG=${JSON.stringify(invocationLog)}`,
    'export FAKE_STANDARD_ACP_FAIL_FIRST_LOAD=1',
    `exec ${JSON.stringify(process.execPath)} --experimental-strip-types ${JSON.stringify(FAKE_STANDARD_ACP)} "$@"`,
    '',
  ];
  await writeFile(bin, lines.join('\n'), 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

async function readInvocations(logPath: string): Promise<string[]> {
  const raw = await readFile(logPath, 'utf8');
  const methods: string[] = [];
  for (const line of raw.trim().split('\n').filter(Boolean)) {
    const value: unknown = JSON.parse(line);
    if (
      value !== null
      && typeof value === 'object'
      && 'method' in value
      && typeof value.method === 'string'
    ) {
      methods.push(value.method);
    }
  }
  return methods;
}

async function putConfig(url: string, hermesBin: string): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agentId: 'hermes',
      agentCliEnv: { hermes: { HERMES_BIN: hermesBin } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    }),
  });
  expect(response.status).toBe(200);
}

async function createConversation(url: string): Promise<RunIdentity> {
  const projectId = `standard_acp_resume_${randomUUID()}`;
  const workspaceId = `standard_acp_workspace_${projectId}`;
  const workspaceMemberId = `standard_acp_owner_${projectId}`;
  const response = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-workspace-id': workspaceId,
      'x-od-workspace-type': 'personal',
      'x-od-workspace-member-id': workspaceMemberId,
      'x-od-workspace-role': 'owner',
    },
    body: JSON.stringify({
      id: projectId,
      name: 'Standard ACP resume smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(response.status).toBe(200);
  const value: unknown = await response.json();
  if (
    value === null
    || typeof value !== 'object'
    || !('conversationId' in value)
    || typeof value.conversationId !== 'string'
  ) {
    throw new Error('project response did not include conversationId');
  }
  return { projectId, conversationId: value.conversationId, workspaceId, workspaceMemberId };
}

async function sendRunAndWait(
  url: string,
  identity: RunIdentity,
  message: string,
): Promise<RunStatus> {
  const headers = {
    'content-type': 'application/json',
    'x-od-analytics-device-id': 'standard-acp-resume-test',
    'x-od-analytics-session-id': 'standard-acp-resume-session',
    'x-od-analytics-client-type': 'web',
    'x-od-workspace-id': identity.workspaceId,
    'x-od-workspace-type': 'personal',
    'x-od-workspace-member-id': identity.workspaceMemberId,
    'x-od-workspace-role': 'owner',
  };
  const response = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      projectId: identity.projectId,
      conversationId: identity.conversationId,
      assistantMessageId: `assistant_standard_acp_${randomUUID()}`,
      clientRequestId: `client_standard_acp_${randomUUID()}`,
      agentId: 'hermes',
      message,
      currentPrompt: message,
    }),
  });
  const value: unknown = await response.json();
  expect(response.status, JSON.stringify(value)).toBe(202);
  if (
    value === null
    || typeof value !== 'object'
    || !('runId' in value)
    || typeof value.runId !== 'string'
  ) {
    throw new Error('run response did not include runId');
  }
  return await waitForRun(url, value.runId, headers);
}

async function waitForRun(
  url: string,
  runId: string,
  headers: Record<string, string>,
): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`, { headers });
    expect(response.status).toBe(200);
    const value: unknown = await response.json();
    if (
      value !== null
      && typeof value === 'object'
      && 'id' in value
      && typeof value.id === 'string'
      && 'status' in value
      && typeof value.status === 'string'
    ) {
      if (value.status === 'failed' || value.status === 'succeeded' || value.status === 'canceled') {
        return {
          id: value.id,
          status: value.status,
          error: 'error' in value && typeof value.error === 'string' ? value.error : null,
          errorCode: 'errorCode' in value && typeof value.errorCode === 'string' ? value.errorCode : null,
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${runId} did not finish`);
}
