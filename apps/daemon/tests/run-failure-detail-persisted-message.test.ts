import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// #895 regression: the daemon classifies a failure's fine-grained cause
// (failure_category / failure_detail) at finalize. The live web error handler
// stamps that onto the assistant message, but a failure persisted purely on the
// daemon side — or a conversation reloaded before the web save lands — reads the
// stored message instead of the live SSE stream. Historically that stored
// `status:error` event only carried `{ detail, code }`, so a reload fell back to
// the coarse errorCode UI and lost the specific fix guidance.
//
// This asserts the STORED assistant message (not just the run-status DTO)
// carries `failureCategory` / `failureDetail` after a failed hard-quota run.

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = { id: string; status: string };

type PersistedEvent = {
  kind?: string;
  label?: string;
  detail?: string;
  code?: string;
  failureCategory?: string;
  failureDetail?: string;
};

type StoredMessage = {
  id: string;
  role: string;
  events?: PersistedEvent[];
};

type RunHandles = {
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  status: RunStatus;
};

describe('run failure classification persisted to assistant message', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await removeTempDir(binDir);
    binDir = null;
    restoreEnv(originalEnv);
  });

  it('stamps failureCategory/failureDetail onto the stored error event on a hard-quota failure', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-failure-detail-msg-bin-'));
    const fakeClaude = await writeHardQuotaClaude(binDir, 'claude-hard-quota');

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const run = await sendRunAndWait(started.url, projectId, conversationId);
    expect(run.status.status).toBe('failed');

    // Read the STORED message the same way a reload does (daemon HTTP API),
    // not the live stream, so this proves the daemon-owned persistence path.
    const stored = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      run.assistantMessageId,
    );
    expect(stored).not.toBeNull();

    const errorEvent = [...(stored?.events ?? [])]
      .reverse()
      .find((event) => event.kind === 'status' && event.label === 'error');
    expect(errorEvent, 'persisted assistant message should carry a status:error event').toBeTruthy();
    expect(errorEvent?.failureCategory).toBe('rate_limit');
    expect(errorEvent?.failureDetail).toBe('hard_quota');
  });
});

function snapshotEnv(): Record<string, string | undefined> {
  return {
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
  };
}

function restoreEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

// Fake Claude CLI: emits the init frame, then dies with a hard-quota billing
// message on stderr (matches isHardQuotaText -> detail 'hard_quota', which is
// non-retryable so the run fails on the first attempt).
async function writeHardQuotaClaude(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(
    bin,
    `#!/usr/bin/env node
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0-hard-quota'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p [--include-partial-messages]'); process.exit(0); }
console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-quota-test' }));
process.stderr.write('You have exceeded your current quota. Please upgrade your plan to continue.\\n');
setTimeout(() => process.exit(1), 20);
`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function createConversation(
  url: string,
): Promise<{ projectId: string; conversationId: string }> {
  const projectId = `failure_detail_msg_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Failure detail persisted message smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = (await projectResponse.json()) as { conversationId: string; id: string };
  return { projectId, conversationId: projectBody.conversationId };
}

async function sendRunAndWait(
  url: string,
  projectId: string,
  conversationId: string,
): Promise<RunHandles> {
  const assistantMessageId = `assistant_failure_detail_msg_${randomUUID()}`;
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'failure-detail-msg-test',
      'x-od-analytics-session-id': 'failure-detail-msg-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId: `client_failure_detail_msg_${randomUUID()}`,
      agentId: 'claude',
      message: 'please do the task',
      currentPrompt: 'please do the task',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = (await runResponse.json()) as { runId: string };
  const status = await waitForRun(url, body.runId);
  return { projectId, conversationId, assistantMessageId, status };
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = (await response.json()) as RunStatus;
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await delay(100);
  }
  throw new Error(`run ${runId} did not finish`);
}

async function fetchAssistantMessage(
  url: string,
  projectId: string,
  conversationId: string,
  assistantMessageId: string,
): Promise<StoredMessage | null> {
  const response = await fetch(
    `${url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { messages?: StoredMessage[] };
  return body.messages?.find((message) => message.id === assistantMessageId) ?? null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
