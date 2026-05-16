import { requestJson, requestText } from './http.ts';

export type ChatRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export type ChatRunCreateBody = {
  agentId: string;
  assistantMessageId: string;
  clientRequestId: string;
  conversationId: string;
  designSystemId?: string | null;
  message: string;
  model?: string | null;
  projectId: string;
  reasoning?: string | null;
  skillId?: string | null;
};

export type ChatRunStatusBody = {
  agentId: string | null;
  assistantMessageId: string | null;
  conversationId: string | null;
  createdAt: number;
  exitCode?: number | null;
  id: string;
  projectId: string | null;
  signal?: string | null;
  status: ChatRunStatus;
  updatedAt: number;
};

export async function startRun(
  baseUrl: string,
  body: ChatRunCreateBody,
): Promise<{ runId: string }> {
  return await requestJson<{ runId: string }>(baseUrl, '/api/runs', { body });
}

export async function readRun(
  baseUrl: string,
  runId: string,
): Promise<ChatRunStatusBody> {
  return await requestJson<ChatRunStatusBody>(baseUrl, `/api/runs/${encodeURIComponent(runId)}`);
}

export async function readRunEvents(baseUrl: string, runId: string): Promise<string> {
  return await requestText(baseUrl, `/api/runs/${encodeURIComponent(runId)}/events`);
}

export async function cancelRun(baseUrl: string, runId: string): Promise<{ ok: true }> {
  return await requestJson<{ ok: true }>(
    baseUrl,
    `/api/runs/${encodeURIComponent(runId)}/cancel`,
    { body: {}, method: 'POST' },
  );
}

export async function waitForRunStatus(
  baseUrl: string,
  runId: string,
  expected: ChatRunStatus,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<ChatRunStatusBody> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const intervalMs = options.intervalMs ?? 250;
  const startedAt = Date.now();
  let last: ChatRunStatusBody | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    last = await readRun(baseUrl, runId);
    if (last.status === expected) return last;
    if (last.status === 'failed' || last.status === 'canceled') {
      throw new Error(`run ${runId} reached ${last.status}, expected ${expected}`);
    }
    await delay(intervalMs);
  }

  throw new Error(`run ${runId} did not reach ${expected} within ${timeoutMs}ms; last=${last?.status ?? 'unknown'}`);
}

const TERMINAL_RUN_STATUSES = new Set<ChatRunStatus>(['succeeded', 'failed', 'canceled']);

export async function waitForRunTerminal(
  baseUrl: string,
  runId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<ChatRunStatusBody> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const intervalMs = options.intervalMs ?? 250;
  const startedAt = Date.now();
  let last: ChatRunStatusBody | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    last = await readRun(baseUrl, runId);
    if (TERMINAL_RUN_STATUSES.has(last.status)) return last;
    await delay(intervalMs);
  }

  throw new Error(`run ${runId} did not reach a terminal status within ${timeoutMs}ms; last=${last?.status ?? 'unknown'}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
