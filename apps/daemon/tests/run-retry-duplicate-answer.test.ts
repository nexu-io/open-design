import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

/**
 * OPEND-2566 — 断线重连之后,同一份回答被存了两遍。
 *
 * 这不是手搓两条一样的事件塞进库里。整条链路是真的:
 *   - 第 0 次尝试:agent 调了一次工具、拿到工具结果、把结论**完整地流了出来**,
 *     然后连接断了(进程静默,不活动看门狗把这一次判失败)。
 *   - daemon 认出这是 `post_tool_resume` 形态,按 `native_session_continue`
 *     策略在**同一个 run、同一条 assistant 消息**上重跑。
 *   - 第 1 次尝试带 `--resume <session>` 回来。上游那半句没提交进 session,
 *     模型于是把同一份结论又写了一遍。
 *
 * 落库层是纯追加的:`persistRunEventToAssistantMessage` 把每条 text 事件塞进
 * `message_event_batches`,`mergeMessageAgentEvents` 遇到相邻的 text 就直接拼接。
 * 没有任何东西告诉它「这是第 1 次尝试,第 0 次尝试写的那段作废了」。
 * 于是刷新之后,同一段结论出现两次。
 */

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  status: string;
  eventsLogPath: string;
};

type RunEvent = {
  event: string;
  data: Record<string, unknown>;
};

type StoredMessage = {
  id: string;
  role: string;
  content?: string;
  events?: Array<Record<string, unknown>>;
};

// 第 0 次尝试静默 60s,所以任何值都会确定性地把它判失败;这个预算要远大于
// 第 1 次尝试的子进程冷启动,免得重跑自己踩到看门狗(#5721 同一条路径)。
const STALL_WATCHDOG_TIMEOUT_MS = '3000';

const CONCLUSION = 'Conclusion: ship option A, then measure for two weeks.';

describe('OPEND-2566 duplicate answer after an upstream reconnect', () => {
  const originalEnv = snapshotEnv();
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
    restoreEnv(originalEnv);
  });

  it('stores the re-generated conclusion once, not twice', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-dup-answer-bin-'));
    const fakeClaude = await writeReconnectingClaude(binDir, 'claude-reconnect-dup');

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = STALL_WATCHDOG_TIMEOUT_MS;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForRun(started.url);

    // 前置事实:这确实是一次「同一个 run 里重跑了一次」。不是两个 run,
    // 也不是同一条事件被投递两次。
    const events = await readRunEvents(run.eventsLogPath);
    expect(events.filter((event) => event.event === 'start')).toHaveLength(2);
    expect(events.find((event) => event.event === 'run_retry_attempted')?.data)
      .toMatchObject({
        retry_strategy: 'native_session_continue',
        retry_reason: 'post_tool_resume',
        failure_stage: 'post_tool_resume',
      });

    // 屏幕上那一份:SSE 上真的流过两遍(模型重采样了)。这一条不是被测行为,
    // 是把「内容层」和「存储层」分开的量法 —— 它绿着,说明上游确实生成了两次。
    const streamedText = events
      .filter((event) => event.event === 'agent' && event.data.type === 'text_delta')
      .map((event) => String(event.data.delta ?? ''))
      .join('');
    expect(countOccurrences(streamedText, CONCLUSION)).toBe(2);

    // 被测行为:刷新之后读到的那一份。重跑作废了上一次尝试写的内容,
    // 所以持久化的结论只能有一份。
    const stored = await readAssistantMessage(
      started.url,
      run.projectId,
      run.conversationId,
      run.assistantMessageId,
    );
    expect(stored).not.toBeNull();
    const storedText = assistantText(stored!);
    expect(countOccurrences(storedText, CONCLUSION)).toBe(1);
    expect(countOccurrences(stored!.content ?? '', CONCLUSION)).toBe(1);
  }, 60_000);
});

/**
 * 第 0 次尝试:工具调用 -> 工具结果 -> 把结论完整流出来 -> 静默(连接断了)。
 * 第 1 次尝试(带 --resume):同一份结论重来一遍,正常收尾。
 */
async function writeReconnectingClaude(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  const counterPath = path.join(dir, `${name}-attempts`);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const counterPath = ${JSON.stringify(counterPath)};
const conclusion = ${JSON.stringify(CONCLUSION)};
if (process.argv.includes('--version')) {
  console.log('claude-code 1.0.0-reconnect-dup');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]');
  process.exit(0);
}
// 辅助调用(记忆抽取 / 标题生成)不许消耗对话尝试计数。
if (!process.argv.includes('--session-id') && !process.argv.includes('--resume')) {
  process.stdout.write('{"entries":[]}');
  process.exit(0);
}
let attempts = 0;
try { attempts = Number(fs.readFileSync(counterPath, 'utf8')) || 0; } catch {}
fs.writeFileSync(counterPath, String(attempts + 1));
process.stdin.resume();
const emit = (obj) => console.log(JSON.stringify(obj));
if (attempts === 0) {
  emit({ type: 'system', subtype: 'init', model: 'claude-reconnect-dup' });
  emit({
    type: 'assistant',
    message: {
      id: 'msg-tool',
      content: [{ type: 'tool_use', id: 'tool-dup', name: 'Read', input: { file_path: 'README.md' } }],
      stop_reason: 'tool_use'
    }
  });
  emit({
    type: 'user',
    message: {
      content: [{ type: 'tool_result', tool_use_id: 'tool-dup', content: 'read once', is_error: false }]
    }
  });
  // 结论已经完整地流到了屏幕上,但 turn 还没关 —— 然后上游断了。
  for (const piece of [conclusion.slice(0, 20), conclusion.slice(20)]) {
    emit({
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } }
    });
  }
  setTimeout(() => process.exit(0), 60000);
} else {
  setTimeout(() => {
    emit({ type: 'system', subtype: 'init', model: 'claude-reconnect-dup-resumed' });
    emit({
      type: 'assistant',
      message: {
        id: 'msg-resumed',
        content: [{ type: 'text', text: conclusion }],
        stop_reason: 'end_turn'
      }
    });
    setTimeout(() => process.exit(0), 20);
  }, 100);
}
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function assistantText(message: StoredMessage): string {
  const fromEvents = (message.events ?? [])
    .filter((event) => event.kind === 'text' && typeof event.text === 'string')
    .map((event) => String(event.text))
    .join('');
  return `${fromEvents}`;
}

async function readAssistantMessage(
  url: string,
  projectId: string,
  conversationId: string,
  messageId: string,
): Promise<StoredMessage | null> {
  const response = await fetch(
    `${url}/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  expect(response.status).toBe(200);
  const body = await response.json() as { messages?: StoredMessage[] };
  return (body.messages ?? []).find((message) => message.id === messageId) ?? null;
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function createAndWaitForRun(url: string): Promise<RunStatus> {
  const projectId = `dup_answer_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Duplicate answer smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = await projectResponse.json() as { conversationId: string };
  const assistantMessageId = `assistant_dup_${randomUUID()}`;
  const prompt = 'compare the two options and give me one conclusion';
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'dup-answer-test',
      'x-od-analytics-session-id': 'dup-answer-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId,
      clientRequestId: `client_dup_${randomUUID()}`,
      agentId: 'claude',
      message: prompt,
      currentPrompt: prompt,
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = await runResponse.json() as { runId: string };
  return await waitForRun(url, body.runId);
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const eventsResponse = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}/events`);
  expect(eventsResponse.status).toBe(200);
  await eventsResponse.text();

  const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
  expect(response.status).toBe(200);
  const run = await response.json() as RunStatus;
  expect(['failed', 'succeeded', 'canceled']).toContain(run.status);
  await waitForPersistedRunEnd(run.eventsLogPath);
  return run;
}

async function waitForPersistedRunEnd(file: string): Promise<void> {
  for (;;) {
    try {
      const events = await readRunEvents(file);
      if (events.some((event) => event.event === 'end')) return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}

async function readRunEvents(file: string): Promise<RunEvent[]> {
  const raw = await readFile(file, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunEvent);
}

const TRACKED_ENV_KEYS = [
  'POSTHOG_KEY',
  'POSTHOG_HOST',
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'LANGFUSE_BASE_URL',
  'OPEN_DESIGN_TELEMETRY_RELAY_URL',
  'OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS',
  'OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS',
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of TRACKED_ENV_KEYS) snapshot[key] = process.env[key];
  return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const key of TRACKED_ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
