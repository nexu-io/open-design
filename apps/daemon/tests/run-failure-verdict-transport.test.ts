import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

/**
 * daemon 那一头到底发没发 —— 在真正的 HTTP 边界上问。
 *
 * daemon 在 finalize 时算出 `retryable` + `user_action`
 * (`run-failure-classification.ts`),但只把 `user_action` 存成
 * `run.failureAction`,而 `retryable` 整个被丢掉;SSE 的 `end` 帧和落库的
 * `status:error` 事件都只带 `failureCategory` / `failureDetail`。结果就是
 * web 那条「后端说重试没用就降档」的分支恒不成立。
 *
 * 这里跑一次真实的失败 run(hard quota:`retryable:false` / `user_action:'none'`),
 * 然后从三个用户可见的出口各问一遍:
 *
 *  - SSE `end` 帧(实时那条路)
 *  - `GET /api/runs/:id`(断线重连的兜底那条路)
 *  - 落库的 assistant 消息(重载对话那条路)
 *
 * `retryable: false` 是假值,任何 `x ? { x } : {}` 形状的守卫都会在这里把它吃掉,
 * 所以三处都用显式相等断言。
 */

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  status: string;
  failureCategory?: string | null;
  failureDetail?: string | null;
  failureAction?: string | null;
  retryable?: boolean | null;
};

type PersistedEvent = {
  kind?: string;
  label?: string;
  detail?: string;
  code?: string;
  failureCategory?: string;
  failureDetail?: string;
  failureAction?: string;
  retryable?: boolean;
};

type StoredMessage = { id: string; role: string; events?: PersistedEvent[] };

type SseFrame = { event: string; data: Record<string, unknown> };

describe('daemon carries the failure verdict to every client-visible exit', () => {
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

  it('puts retryable/failureAction on the SSE end frame, the run status, and the stored error event', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-failure-verdict-bin-'));
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
    // 事实前提:这一格是分类器判过的「重试没用」。
    expect(run.status.failureDetail).toBe('hard_quota');

    // 出口 1 —— 实时那条路。
    const frames = await readRunEvents(started.url, run.status.id);
    const end = [...frames].reverse().find((frame) => frame.event === 'end');
    expect(end, 'terminal SSE frame should exist').toBeTruthy();
    expect(end!.data.failureDetail).toBe('hard_quota');
    expect(end!.data.retryable).toBe(false);
    expect(end!.data.failureAction).toBe('none');

    // 出口 2 —— 断线重连的兜底那条路。
    expect(run.status.retryable).toBe(false);
    expect(run.status.failureAction).toBe('none');

    // 出口 3 —— 重载对话那条路。
    const stored = await fetchAssistantMessage(
      started.url,
      projectId,
      conversationId,
      run.assistantMessageId,
    );
    const errorEvent = [...(stored?.events ?? [])]
      .reverse()
      .find((event) => event.kind === 'status' && event.label === 'error');
    expect(errorEvent, 'persisted assistant message should carry a status:error event').toBeTruthy();
    expect(errorEvent?.failureDetail).toBe('hard_quota');
    expect(errorEvent?.retryable).toBe(false);
    expect(errorEvent?.failureAction).toBe('none');
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
// message on stderr (matches isHardQuotaText -> detail 'hard_quota', which the
// classifier rules non-retryable, so the run fails on the first attempt).
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
  const projectId = `failure_verdict_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Failure verdict transport smoke',
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
): Promise<{ assistantMessageId: string; status: RunStatus }> {
  const assistantMessageId = `assistant_failure_verdict_${randomUUID()}`;
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'failure-verdict-test',
      'x-od-analytics-session-id': 'failure-verdict-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId: `client_failure_verdict_${randomUUID()}`,
      agentId: 'claude',
      message: 'please do the task',
      currentPrompt: 'please do the task',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = (await runResponse.json()) as { runId: string };
  const status = await waitForRun(url, body.runId);
  return { assistantMessageId, status };
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = (await response.json()) as RunStatus;
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return { ...run, id: runId };
    }
    await delay(100);
  }
  throw new Error(`run ${runId} did not finish`);
}

/** Replay the terminated run's event log the way a reattaching client does. */
async function readRunEvents(url: string, runId: string): Promise<SseFrame[]> {
  const response = await fetch(
    `${url}/api/runs/${encodeURIComponent(runId)}/events?after=0`,
  );
  expect(response.status).toBe(200);
  const text = await response.text();
  const frames: SseFrame[] = [];
  for (const block of text.split('\n\n')) {
    let event: string | null = null;
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
    }
    if (!event || dataLines.length === 0) continue;
    try {
      frames.push({ event, data: JSON.parse(dataLines.join('\n')) as Record<string, unknown> });
    } catch {
      // keepalives / non-JSON frames are not interesting here
    }
  }
  return frames;
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
