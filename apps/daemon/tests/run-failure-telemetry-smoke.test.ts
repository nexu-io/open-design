import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import { classifyRunFailure } from '../src/run-failure-classification.js';
import { summarizeRunDiagnosticsForAnalytics } from '../src/run-diagnostics.js';
import { deriveRunErrorCode, runResultFromStatus } from '../src/run-result.js';

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
  agentId: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  exitCode: number | null;
  signal: string | null;
  error: string | null;
  errorCode: string | null;
  eventsLogPath: string;
};

type RunEvent = {
  event: string;
  data: unknown;
};

describe('run failure telemetry smoke', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;
  let ingestion: Awaited<ReturnType<typeof startLangfuseIngestion>> | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    await Promise.resolve(ingestion?.close());
    ingestion = null;
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
    restoreEnv(originalEnv);
  });

  it('drives representative failed runs through analytics and Langfuse diagnostics', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-run-failure-smoke-bin-'));
    await writeFakeClaude(binDir, 'claude-auth', [
      'HTTP 401 Unauthorized: invalid API key.',
      'Please run /login.',
    ].join(' '));
    await writeFakeClaude(binDir, 'claude-rate-limit', [
      'HTTP 429 Too Many Requests: rate limit exceeded by upstream provider.',
      'Retry after 30 seconds.',
    ].join(' '));
    await writeFakeClaude(binDir, 'claude-upstream', [
      'HTTP 503 Service Unavailable: upstream provider unavailable.',
      'Gateway timeout while waiting for first token.',
    ].join(' '));
    await writeFakeClaude(binDir, 'claude-hang', null);
    await writeFakeDeepseek(binDir, 'deepseek');

    ingestion = await startLangfuseIngestion();
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    process.env.LANGFUSE_BASE_URL = ingestion.url;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    delete process.env.POSTHOG_KEY;
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = '400';

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      telemetry: { metrics: true, content: true, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const cases = [
      {
        id: 'auth_401',
        agentId: 'claude',
        config: { agentCliEnv: { claude: { CLAUDE_BIN: path.join(binDir, 'claude-auth') } } },
        expectedCode: 'AGENT_AUTH_REQUIRED',
        expectedCodes: ['AGENT_AUTH_REQUIRED', 'AGENT_EXECUTION_FAILED'],
        expectedCategory: 'auth',
        expectedDetail: 'auth_required',
        expectedDiagnosticSource: 'error_event',
        expectStderr: true,
      },
      {
        id: 'rate_limit_429',
        agentId: 'claude',
        config: { agentCliEnv: { claude: { CLAUDE_BIN: path.join(binDir, 'claude-rate-limit') } } },
        expectedCode: 'RATE_LIMITED',
        expectedCategory: 'rate_limit',
        expectedDetail: 'rate_limit_429',
        expectedDiagnosticSource: 'error_event',
        expectStderr: true,
      },
      {
        id: 'upstream_503',
        agentId: 'claude',
        config: { agentCliEnv: { claude: { CLAUDE_BIN: path.join(binDir, 'claude-upstream') } } },
        expectedCode: 'UPSTREAM_UNAVAILABLE',
        expectedCategory: 'upstream_unavailable',
        expectedDetail: 'upstream_5xx',
        expectedDiagnosticSource: 'error_event',
        expectStderr: true,
      },
      {
        id: 'context_window',
        agentId: 'deepseek',
        config: { agentCliEnv: { deepseek: { DEEPSEEK_BIN: path.join(binDir, 'deepseek') } } },
        expectedCode: 'AGENT_PROMPT_TOO_LARGE',
        expectedCategory: 'prompt_too_large',
        expectedDetail: 'prompt_too_large',
        expectedDiagnosticSource: 'error_event',
        expectStderr: false,
        message: `od-failure-smoke-context ${'large-context '.repeat(4000)}`,
      },
      {
        id: 'hang_timeout',
        agentId: 'claude',
        config: { agentCliEnv: { claude: { CLAUDE_BIN: path.join(binDir, 'claude-hang') } } },
        expectedCode: 'AGENT_EXECUTION_FAILED',
        expectedCategory: 'timeout',
        expectedDetail: 'inactivity_timeout',
        expectedDiagnosticSource: 'error_event',
        expectStderr: false,
      },
    ] as const;

    for (const item of cases) {
      await putConfig(started.url, { agentId: item.agentId, ...item.config });
      const run = await createAndWaitForRun(started.url, {
        caseId: item.id,
        agentId: item.agentId,
        message: 'message' in item ? item.message : `od-failure-smoke-${item.id}`,
      });
      const events = await readRunEvents(run.eventsLogPath);
      const errorCode = deriveRunErrorCode(run);
      const failure = classifyRunFailure({
        result: runResultFromStatus(run.status),
        status: run,
        ...(errorCode ? { errorCode } : {}),
        agentId: run.agentId,
        events,
      });
      const diagnostics = summarizeRunDiagnosticsForAnalytics({
        events,
        exitCode: run.exitCode,
        signal: run.signal,
      });

      expect(run.status).toBe('failed');
      expect('expectedCodes' in item ? item.expectedCodes : [item.expectedCode])
        .toContain(errorCode);
      expect(failure?.failure_category).toBe(item.expectedCategory);
      expect(failure?.failure_detail).toBe(item.expectedDetail);
      expect(diagnostics.diagnostic_source).toBe(item.expectedDiagnosticSource);
      expect(diagnostics.stderr_present).toBe(item.expectStderr);

      await finalizeAssistantMessage(started.url, run);
      const trace = await ingestion.waitForTrace(run.id);
      expect('expectedCodes' in item ? item.expectedCodes : [item.expectedCode])
        .toContain(trace.body.metadata.error_code);
      expect(trace.body.metadata.failure_category).toBe(item.expectedCategory);
      expect(trace.body.metadata.failure_detail).toBe(item.expectedDetail);
      if (item.expectStderr) {
        expect(trace.body.metadata.stderr.lineCount).toBeGreaterThan(0);
      } else {
        expect(trace.body.metadata.stderr).toBeUndefined();
      }
    }
  });
});

function snapshotEnv(): Record<string, string | undefined> {
  return {
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS: process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS,
  };
}

function restoreEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function writeFakeClaude(dir: string, name: string, stderr: string | null): Promise<void> {
  const bin = path.join(dir, name);
  const body = stderr === null
    ? `setInterval(() => {}, 1000);\n`
    : `process.stderr.write(${JSON.stringify(`${stderr}\n`)});\nsetTimeout(() => process.exit(1), 100);\n`;
  await writeFile(bin, `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('claude-code 1.0.0-smoke');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]');
  process.exit(0);
}
${body}`, 'utf8');
  await chmod(bin, 0o755);
}

async function writeFakeDeepseek(dir: string, name: string): Promise<void> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('deepseek 0.0.0-smoke');
  process.exit(0);
}
console.log('DeepSeek fake should not be spawned for prompt-too-large smoke.');
process.exit(0);
`, 'utf8');
  await chmod(bin, 0o755);
}

async function startLangfuseIngestion(): Promise<{
  url: string;
  batches: Array<{ batch: Array<{ type: string; body: Record<string, any> }> }>;
  traces: Array<{ type: string; body: Record<string, any> }>;
  close: () => Promise<void>;
  waitForTrace: (traceId: string) => Promise<{ type: string; body: Record<string, any> }>;
}> {
  const batches: Array<{ batch: Array<{ type: string; body: Record<string, any> }> }> = [];
  const server = await new Promise<Server>((resolve) => {
    const srv = createServer((req, res) => {
      let raw = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        if (req.url === '/api/public/ingestion' && req.method === 'POST') {
          batches.push(JSON.parse(raw));
          res.writeHead(207, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ successes: [], errors: [] }));
          return;
        }
        res.writeHead(404).end();
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing ingestion address');
  const traces = () => batches.flatMap((batch) => batch.batch).filter((item) => item.type === 'trace-create');
  return {
    url: `http://127.0.0.1:${address.port}`,
    batches,
    get traces() {
      return traces();
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    waitForTrace: async (traceId: string) => {
      const started = Date.now();
      while (Date.now() - started < 3000) {
        const found = traces().find((item) => item.body.id === traceId);
        if (found) return found;
        await delay(50);
      }
      throw new Error(`timed out waiting for trace ${traceId}`);
    },
  };
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function createAndWaitForRun(url: string, input: {
  caseId: string;
  agentId: string;
  message: string;
}): Promise<RunStatus> {
  const projectId = `failure_smoke_${input.caseId}_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: `Failure smoke ${input.caseId}`,
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = await projectResponse.json() as { conversationId: string };
  const assistantMessageId = `assistant_${input.caseId}_${randomUUID()}`;
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId,
      clientRequestId: `client_${input.caseId}_${randomUUID()}`,
      agentId: input.agentId,
      message: input.message,
      currentPrompt: input.message,
    }),
  });
  expect(runResponse.status).toBe(202);
  const runBody = await runResponse.json() as { runId: string };
  return await waitForRun(url, runBody.runId);
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await delay(100);
  }
  throw new Error(`run ${runId} did not finish`);
}

async function readRunEvents(file: string): Promise<RunEvent[]> {
  const raw = await readFile(file, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunEvent);
}

async function finalizeAssistantMessage(url: string, run: RunStatus): Promise<void> {
  const response = await fetch(
    `${url}/api/projects/${encodeURIComponent(run.projectId)}/conversations/${encodeURIComponent(run.conversationId)}/messages/${encodeURIComponent(run.assistantMessageId)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: run.assistantMessageId,
        role: 'assistant',
        content: run.error ?? '',
        agentId: run.agentId,
        runId: run.id,
        runStatus: run.status,
        startedAt: run.createdAt,
        endedAt: run.updatedAt,
        telemetryFinalized: true,
      }),
    },
  );
  expect(response.status).toBe(200);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
