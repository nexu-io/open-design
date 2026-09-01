import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path, { delimiter } from 'node:path';
import { register } from 'prom-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { claudeAgentDef } from '../../src/runtimes/defs/claude.js';
import { classifyRunFailure } from '../../src/run-failure-classification.js';
import { summarizeRunDiagnosticsForAnalytics } from '../../src/run-diagnostics.js';
import { deriveRunErrorCode, runResultFromStatus } from '../../src/run-result.js';

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
  /** The daemon's own settled verdict, published on the terminal run status. */
  failureCategory: string | null;
  failureDetail: string | null;
  eventsLogPath: string;
};

type RunEvent = {
  event: string;
  data: unknown;
};

type IngestionEvent = { type: string; body: Record<string, any> };

/**
 * One Run's place in the OD Next task hierarchy as Langfuse received it: the
 * `strategy-task:<taskExecutionId>` trace plus the `strategy-stage:<stage>`
 * child span that owns this `runId`.
 */
type TaskRunObservation = {
  trace: IngestionEvent;
  span: IngestionEvent;
  taskExecutionId: string;
};

describe('run failure telemetry smoke', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;
  let dataDirs: string[] = [];
  let ingestion: Awaited<ReturnType<typeof startLangfuseIngestion>> | null = null;
  let restoreSetTimeout: (() => void) | null = null;

  afterEach(async () => {
    restoreSetTimeout?.();
    restoreSetTimeout = null;
    await stopDaemon();
    await Promise.resolve(ingestion?.close());
    ingestion = null;
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
    for (const root of dataDirs) await removeDataDir(root);
    dataDirs = [];
    restoreEnv(originalEnv);
    // server.ts registers prom-client metrics on the shared default registry
    // at import time, so the registry has to be emptied before the next case
    // re-imports it against its own data root.
    register.clear();
    vi.resetModules();
  });

  async function stopDaemon(): Promise<void> {
    const current = started;
    started = null;
    if (!current) return;
    await Promise.resolve(current.shutdown?.());
    current.server.closeAllConnections?.();
    current.server.closeIdleConnections?.();
    await new Promise<void>((resolve) => current.server.close(() => resolve()));
  }

  /**
   * Each case owns its daemon data root.
   *
   * `server.ts` resolves `OD_DATA_DIR` into `RUNTIME_DATA_DIR` once at module
   * import time, so a fresh root only takes effect behind `vi.resetModules()`
   * plus a dynamic import. Sharing one root across cases let the first case's
   * failures latch the OD Next rollout stop in SQLite, which silently pushed
   * later cases onto the legacy single-Run reporter and made their telemetry
   * assertions pass against a path they were not meant to exercise.
   */
  async function startIsolatedServer(): Promise<StartedServer> {
    await stopDaemon();
    // A second daemon in the same worker would re-register the prom-client
    // metrics that server.ts owns, so drop the previous registration first.
    register.clear();
    vi.resetModules();
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-run-failure-smoke-data-'));
    dataDirs.push(root);
    process.env.OD_DATA_DIR = root;
    const serverModule = await import('../../src/server.js') as unknown as {
      startServer(options: { port: number; returnServer: true }): Promise<StartedServer>;
    };
    return await serverModule.startServer({ port: 0, returnServer: true });
  }

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
      // stderr is free text, so it can carry a local path. The delivered tail
      // must be masked before it leaves the daemon — including the wider path
      // shapes (/opt, /tmp, /private/var, UNC, file://) that only the
      // Prompt-stack masker covers.
      'Loaded config from /Users/od-smoke-user/.config/open-design/creds.json',
      'via /opt/od-smoke-user/state.json.',
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

    const cases = [
      {
        id: 'auth_401',
        daemonPublishesVerdict: true,
        representation: 'task_hierarchy',
        agentId: 'claude',
        config: { agentCliEnv: { claude: { CLAUDE_BIN: path.join(binDir, 'claude-auth') } } },
        expectedCode: 'AGENT_AUTH_REQUIRED',
        expectedCodes: ['AGENT_AUTH_REQUIRED', 'AGENT_EXECUTION_FAILED'],
        expectedCategory: 'auth',
        expectedDetail: 'invalid_api_key',
        expectedDiagnosticSource: 'error_event',
        expectStderr: true,
      },
      {
        id: 'rate_limit_429',
        daemonPublishesVerdict: true,
        representation: 'task_hierarchy',
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
        daemonPublishesVerdict: true,
        representation: 'task_hierarchy',
        agentId: 'claude',
        config: { agentCliEnv: { claude: { CLAUDE_BIN: path.join(binDir, 'claude-upstream') } } },
        expectedCode: 'UPSTREAM_UNAVAILABLE',
        expectedCategory: 'upstream_unavailable',
        expectedDetail: 'upstream_5xx',
        expectedDiagnosticSource: 'error_event',
        expectStderr: true,
        expectRedactedStderrPath: true,
      },
      {
        // deepseek is outside OD_NEXT_RUNTIME_PATH_DESCRIPTORS, so the rollout
        // reports `od_next_rollout_agent_ineligible` and this Run keeps the
        // compatibility single-Run trace. The same diagnostics must show up
        // there.
        id: 'context_window',
        representation: 'single_run',
        // Rejected during prompt assembly, before the runtime finish path that
        // stamps run.failureCategory, so the status carries no daemon verdict.
        daemonPublishesVerdict: false,
        agentId: 'deepseek',
        config: { agentCliEnv: { deepseek: { DEEPSEEK_BIN: path.join(binDir, 'deepseek') } } },
        expectedCode: 'AGENT_PROMPT_TOO_LARGE',
        expectedCategory: 'prompt_too_large',
        expectedDetail: 'prompt_too_large',
        expectedDiagnosticSource: 'error_event',
        expectStderr: false,
        message: `od-failure-smoke-context ${'large-context '.repeat(10_000)}`,
      },
      {
        id: 'hang_timeout',
        daemonPublishesVerdict: true,
        representation: 'task_hierarchy',
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
      // Every case needs its own daemon and data root. The OD Next rollout
      // stop latch lives in SQLite and fires for the whole daemon instance
      // once a task continuation is blocked, so a shared daemon would push
      // every case after the first back onto the legacy single-Run reporter.
      started = await startIsolatedServer();
      await putConfig(started.url, {
        telemetry: { metrics: true, content: true, artifactManifest: false },
        privacyDecisionAt: Date.now(),
        // The task-hierarchy cases are about how an ADMITTED Run reports, so
        // the installation has to be opted into OD Next. The single-Run case
        // stays single-Run on top of the same opt-in, because deepseek sits
        // outside the capability gate — which is the contrast this table is
        // drawing in the first place.
        odNextStrategyMode: 'active',
      });
      await putConfig(started.url, { agentId: item.agentId, ...item.config });
      const run = await createAndWaitForRun(started.url, {
        caseId: item.id,
        agentId: item.agentId,
        message: 'message' in item ? item.message : `od-failure-smoke-${item.id}`,
      });
      const events = await readCompletedRunEvents(run.eventsLogPath);
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

      expect(run.status, item.id).toBe('failed');
      expect('expectedCodes' in item ? item.expectedCodes : [item.expectedCode])
        .toContain(errorCode);
      // The daemon computes its own verdict from in-memory events when the
      // runtime finishes and publishes it on the terminal run status. That is
      // the value the chat UI, the persisted message, and telemetry consume,
      // so assert it directly instead of only re-deriving a verdict test-side.
      // A request rejected before the runtime finish path never reaches that
      // assignment, so each case states which side of the boundary it is on
      // rather than tolerating a null.
      expect(run.failureCategory, item.id)
        .toBe(item.daemonPublishesVerdict ? item.expectedCategory : null);
      expect(run.failureDetail, item.id)
        .toBe(item.daemonPublishesVerdict ? item.expectedDetail : null);
      // Re-derivation from the completed durable log must agree with it.
      expect(failure?.failure_category, item.id).toBe(item.expectedCategory);
      expect(failure?.failure_detail, item.id).toBe(item.expectedDetail);
      expect(diagnostics.diagnostic_source, item.id).toBe(item.expectedDiagnosticSource);
      expect(diagnostics.stderr_present, item.id).toBe(item.expectStderr);

      await finalizeAssistantMessage(started.url, run);
      if (item.representation === 'task_hierarchy') {
        const observed = await ingestion.waitForTaskRunObservation(run.id);
        // Task hierarchy identity: one trace per task execution, one child
        // span per Run inside it.
        expect(observed.trace.body.id, item.id)
          .toBe(`strategy-task:${observed.taskExecutionId}`);
        expect(observed.trace.body.name, item.id).toBe('open-design-strategy-task');
        expect(observed.span.body.traceId, item.id).toBe(observed.trace.body.id);
        expect(observed.span.body.id, item.id)
          .toBe(`task-run:${observed.taskExecutionId}:${run.id}`);
        expect(observed.span.body.name, item.id).toBe('strategy-stage:request');

        const metadata = observed.span.body.metadata;
        expect('expectedCodes' in item ? item.expectedCodes : [item.expectedCode])
          .toContain(metadata.errorCode);
        expect(metadata.failureCategory, item.id).toBe(item.expectedCategory);
        expect(metadata.failureDetail, item.id).toBe(item.expectedDetail);

        // Diagnostics coverage the single-Run trace used to carry. Failure
        // classification alone cannot say what the process printed or how it
        // died, so the hierarchy must keep reporting the stderr tail, the host
        // close diagnostics, and the terminal exit code / signal.
        if (item.expectStderr) {
          expect(metadata.stderr.lineCount, item.id).toBeGreaterThan(0);
          expect(metadata.stderr.tail.redacted, item.id).toBe(true);
          expect(metadata.stderr.tail.text.length, item.id).toBeGreaterThan(0);
        } else {
          expect(metadata.stderr, item.id).toBeUndefined();
        }
        if ('expectRedactedStderrPath' in item && item.expectRedactedStderrPath) {
          expect(metadata.stderr.tail.text, item.id).not.toContain('/Users/od-smoke-user');
          expect(metadata.stderr.tail.text, item.id).not.toContain('/opt/od-smoke-user');
          expect(metadata.stderr.tail.text, item.id).toContain('[REDACTED:');
        }
        expect(metadata.diagnostics.diagnostic_source, item.id)
          .toBe(item.expectedDiagnosticSource);
        expect(metadata.diagnostics.stderr_present, item.id).toBe(item.expectStderr);
        expect(run.exitCode !== null || run.signal !== null, item.id).toBe(true);
        expect(metadata.exitCode ?? null, item.id).toBe(run.exitCode);
        expect(metadata.signal ?? null, item.id).toBe(run.signal);
        continue;
      }

      const caseId: string = item.id;
      // Widened so the literal `expectStderr` of a single-case branch does not
      // narrow `item` itself away inside the conditional.
      const expectStderr: boolean = item.expectStderr;
      const trace = await ingestion.waitForSingleRunTrace(run.id);
      expect(trace.body.name, caseId).toBe('open-design-turn');
      expect('expectedCodes' in item ? item.expectedCodes : [item.expectedCode])
        .toContain(trace.body.metadata.error_code);
      expect(trace.body.metadata.failure_category, caseId).toBe(item.expectedCategory);
      expect(trace.body.metadata.failure_detail, caseId).toBe(item.expectedDetail);
      if (expectStderr) {
        expect(trace.body.metadata.stderr.lineCount, caseId).toBeGreaterThan(0);
      } else {
        expect(trace.body.metadata.stderr, caseId).toBeUndefined();
      }
      expect(trace.body.metadata.diagnostics.diagnostic_source, caseId)
        .toBe(item.expectedDiagnosticSource);
      expect(trace.body.metadata.diagnostics.stderr_present, caseId)
        .toBe(expectStderr);
    }
  }, 120_000);

  it('reclassifies upstream + install/env failures end-to-end through a real daemon run (#3408 P1)', async () => {
    // End-to-end proof for the reclassification: a real agent process emits the
    // production error text (or fails to spawn), the daemon records it into the
    // run's events.jsonl, and classifyRunFailure (on the REAL recorded events,
    // not a hand-built input) must land it in the correct category instead of
    // the opaque execution_failed bucket. Generous inactivity timeout so the
    // 100ms exit always wins the race (this test is not about timeouts).
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-amr-reclassify-bin-'));
    await writeFakeClaude(
      binDir,
      'amr-balance',
      '预扣费额度失败, 用户[141283]剩余额度: 💰0.040000, 需要预扣费额度: 💰0.060000 (request id: Babc)',
    );
    await writeFakeClaude(binDir, 'amr-ratelimit', '429 您的账户已达到速率限制，请您控制请求频率');
    await writeFakeClaude(binDir, 'amr-model', 'API Error: 400 model deepseek-v4-pro-202606 not in allowed list');
    await writeFakeClaude(
      binDir,
      'env-node-path',
      "'node' is not recognized as an internal or external command, operable program or batch file.",
    );
    // The agent itself reports a missing vendored sub-binary (real codex shape).
    await writeFakeClaude(
      binDir,
      'env-spawn-enoent',
      'Error: spawn /opt/homebrew/lib/node_modules/@openai/codex/codex ENOENT',
    );
    await writeFakeClaude(
      binDir,
      'a-prefill',
      'MLX prefill memory guard rejected this prompt: Prefill context too large for available memory',
    );
    await writeFakeClaude(
      binDir,
      'a-thread-start',
      'Reading prompt from stdin... Error: thread/start: thread/start failed: failed to start session',
    );
    await writeFakeClaude(
      binDir,
      'a-auth',
      "login fail: Please carry the API secret key in the 'Authorization' field of the request header (1004)",
    );
    await writeFakeClaude(
      binDir,
      'a-lmstudio',
      "No models loaded. Please load a model in the developer page or use the 'lms load' command.",
    );
    await writeFakeClaude(
      binDir,
      'a-resume-expired',
      'no conversation found with session id 1d2c3b4a-0000-0000-0000-000000000000',
    );

    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = '5000';
    delete process.env.POSTHOG_KEY;
    started = await startIsolatedServer();
    await putConfig(started.url, {
      telemetry: { metrics: true, content: true, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const cases = [
      { bin: 'amr-balance', category: 'insufficient_balance', detail: 'amr_insufficient_balance' },
      { bin: 'amr-ratelimit', category: 'rate_limit', detail: 'rate_limit_429' },
      { bin: 'amr-model', category: 'model_unavailable', detail: 'model_not_found' },
      { bin: 'env-node-path', category: 'process_exit', detail: 'cli_not_installed' },
      { bin: 'env-spawn-enoent', category: 'process_exit', detail: 'cli_not_installed' },
      { bin: 'a-prefill', category: 'prompt_too_large', detail: 'prompt_too_large' },
      { bin: 'a-thread-start', category: 'process_exit', detail: 'agent_protocol_error' },
      { bin: 'a-auth', category: 'auth', detail: 'auth_required' },
      { bin: 'a-lmstudio', category: 'model_unavailable', detail: 'local_model_not_loaded' },
      { bin: 'a-resume-expired', category: 'process_exit', detail: 'session_resume_expired' },
    ] as const;

    for (const item of cases) {
      await putConfig(started.url, {
        agentId: 'claude',
        agentCliEnv: { claude: { CLAUDE_BIN: path.join(binDir, item.bin) } },
      });
      const run = await createAndWaitForRun(started.url, {
        caseId: item.bin,
        agentId: 'claude',
        message: `od-amr-reclassify-${item.bin}`,
      });
      const events = await readCompletedRunEvents(run.eventsLogPath);
      const errorCode = deriveRunErrorCode(run);
      const failure = classifyRunFailure({
        result: runResultFromStatus(run.status),
        status: run,
        ...(errorCode ? { errorCode } : {}),
        agentId: run.agentId,
        events,
      });
      expect(run.status, item.bin).toBe('failed');
      // The reclassification must NOT leave it in the opaque bucket.
      expect(failure?.failure_detail, item.bin).not.toBe('execution_failed');
      expect(failure?.failure_category, item.bin).toBe(item.category);
      expect(failure?.failure_detail, item.bin).toBe(item.detail);
    }
  }, 60_000);

  it('keeps buffered Antigravity output admitted before a non-zero policy failure', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-antigravity-admission-bin-'));
    await writeFakeAntigravity(binDir);
    process.env.PATH = `${binDir}${delimiter}${process.env.PATH ?? ''}`;
    delete process.env.POSTHOG_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = await startIsolatedServer();
    await putConfig(started.url, {
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });
    const run = await createAndWaitForRun(started.url, {
      caseId: 'antigravity_buffered_policy_failure',
      agentId: 'antigravity',
      message: 'od-antigravity-buffered-policy-failure',
    });
    const events = await readCompletedRunEvents(run.eventsLogPath);
    const stdoutIndex = events.findIndex((event) => event.event === 'stdout');
    const errorIndex = events.findIndex((event) => event.event === 'error');
    const errorCode = deriveRunErrorCode(run);

    expect(run.status).toBe('failed');
    expect(stdoutIndex).toBeGreaterThanOrEqual(0);
    expect(errorIndex).toBeGreaterThan(stdoutIndex);
    expect(classifyRunFailure({
      result: runResultFromStatus(run.status),
      status: run,
      ...(errorCode ? { errorCode } : {}),
      agentId: run.agentId,
      events,
    })).toMatchObject({
      policy_reason: 'model_window_limit',
      admission_phase: 'during_execution',
      admission_status: 'admitted',
    });
  }, 60_000);

  it('reports the terminal Langfuse fallback for headerless run requests', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-run-failure-fallback-bin-'));
    await writeFakeClaude(binDir, 'claude-terminal-failure', 'terminal fallback smoke failure');

    ingestion = await startLangfuseIngestion();
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    process.env.LANGFUSE_BASE_URL = ingestion.url;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    delete process.env.POSTHOG_KEY;

    started = await startIsolatedServer();
    restoreSetTimeout = accelerateLangfuseTerminalFallbackDelay();
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: path.join(binDir, 'claude-terminal-failure') } },
      telemetry: { metrics: true, content: true, artifactManifest: false },
      privacyDecisionAt: Date.now(),
      // Task-hierarchy reporting only exists for an admitted Run.
      odNextStrategyMode: 'active',
    });

    const run = await createAndWaitForRun(started.url, {
      caseId: 'headerless_terminal_fallback',
      agentId: 'claude',
      message: 'od-failure-smoke-headerless-terminal-fallback',
    });

    const observed = await ingestion.waitForTaskRunObservation(run.id);
    expect(observed.trace.body.id).toBe(`strategy-task:${observed.taskExecutionId}`);
    expect(observed.trace.body.name).toBe('open-design-strategy-task');
    expect(observed.span.body.id).toBe(`task-run:${observed.taskExecutionId}:${run.id}`);
    expect(observed.span.body.metadata.errorCode).toBe(deriveRunErrorCode(run));
  }, 60_000);

  it('reports terminal fallback with buffered content when final telemetry never arrives', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-run-failure-buffered-fallback-bin-'));
    await writeFakeClaude(binDir, 'claude-buffered-fallback', 'buffered fallback smoke failure');

    ingestion = await startLangfuseIngestion();
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    process.env.LANGFUSE_BASE_URL = ingestion.url;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    delete process.env.POSTHOG_KEY;

    started = await startIsolatedServer();
    restoreSetTimeout = accelerateLangfuseTerminalFallbackDelay(1000);
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: path.join(binDir, 'claude-buffered-fallback') } },
      telemetry: { metrics: true, content: true, artifactManifest: false },
      privacyDecisionAt: Date.now(),
      // Task-hierarchy reporting only exists for an admitted Run.
      odNextStrategyMode: 'active',
    });

    const run = await createAndWaitForRun(started.url, {
      caseId: 'buffered_unfinalized_failed_message',
      agentId: 'claude',
      message: 'od-failure-smoke-buffered-unfinalized-message',
    });
    const bufferedContent = 'buffered unfinalized failed assistant content';

    await saveAssistantMessage(started.url, run, {
      content: bufferedContent,
      producedFiles: [{ name: 'buffered-fallback.html', kind: 'html', size: 42 }],
    });
    const observed = await ingestion.waitForTaskRunObservation(run.id);
    expect(observed.span.body.output).toBe(bufferedContent);
  }, 60_000);
});

/**
 * OD Next freezes its Run input snapshots to 0o555/0o444, so a plain recursive
 * remove of the data root can hit EACCES. Restore write permission on the way
 * down before retrying.
 */
async function removeDataDir(root: string): Promise<void> {
  try {
    await rm(root, { recursive: true, force: true });
    return;
  } catch {
    // fall through to the permission-restoring retry
  }
  const { chmodSync, readdirSync, statSync } = await import('node:fs');
  const restore = (target: string): void => {
    try {
      chmodSync(target, 0o700);
      if (!statSync(target).isDirectory()) return;
      for (const entry of readdirSync(target)) restore(path.join(target, entry));
    } catch {
      // best effort
    }
  };
  restore(root);
  await rm(root, { recursive: true, force: true }).catch(() => {});
}

function snapshotEnv(): Record<string, string | undefined> {
  return {
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS: process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS,
    OD_DATA_DIR: process.env.OD_DATA_DIR,
    PATH: process.env.PATH,
  };
}

function restoreEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function accelerateLangfuseTerminalFallbackDelay(delayMs = 0): () => void {
  const originalSetTimeout = globalThis.setTimeout;
  const spy = vi.spyOn(globalThis, 'setTimeout');
  spy.mockImplementation(((
    handler: Parameters<typeof globalThis.setTimeout>[0],
    timeout: Parameters<typeof globalThis.setTimeout>[1],
    ...args: any[]
  ) => {
    const delay = timeout === 15_000 ? delayMs : timeout;
    return originalSetTimeout(handler, delay, ...args);
  }) as typeof globalThis.setTimeout);
  return () => spy.mockRestore();
}

/**
 * Help text the fake Claude CLI advertises, derived from the runtime def so it
 * can never drift from what the daemon probes for.
 *
 * This is not cosmetic. `detectAgents` parses `claude -p --help` for each flag
 * in `capabilityFlags` and caches the result on `agentCapabilities`. Once a
 * physical Run is mapped to an OD Next strategy task, `buildArgs` sets
 * `observeNativeChildBehavior`, and it THROWS when the probe never saw
 * `--forward-subagent-text`. A fake that omits the flag therefore fails the Run
 * inside the daemon before the agent is ever spawned: the Run reports that
 * host-side TypeError (classified `process_exit`) instead of the auth /
 * rate-limit / timeout failure the case scripted, and whether it does depends
 * on when the task mapping becomes visible to `startChatRun`. Advertising the
 * full probed flag set removes that ordering dependence — the fake always
 * spawns and always produces its intended failure.
 */
const FAKE_CLAUDE_HELP = `Usage: claude -p ${
  Object.keys(claudeAgentDef.capabilityFlags).map((flag) => `[${flag}]`).join(' ')
}`;

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
  console.log(${JSON.stringify(FAKE_CLAUDE_HELP)});
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

async function writeFakeAntigravity(dir: string): Promise<void> {
  const bin = path.join(dir, 'agy');
  await writeFile(bin, `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('agy 1.107.0-smoke');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: agy -p [--dangerously-skip-permissions]');
  process.exit(0);
}
process.stdout.write('Example assistant output before the policy failure.\\n');
process.stderr.write('[code=model_limit_exceeded] model usage limit exceeded\\n');
process.exit(1);
`, 'utf8');
  await chmod(bin, 0o755);
}

async function startLangfuseIngestion(): Promise<{
  url: string;
  batches: Array<{ batch: IngestionEvent[] }>;
  traces: IngestionEvent[];
  close: () => Promise<void>;
  waitForTaskRunObservation: (runId: string) => Promise<TaskRunObservation>;
  waitForSingleRunTrace: (runId: string) => Promise<IngestionEvent>;
}> {
  const batches: Array<{ batch: IngestionEvent[] }> = [];
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
  const events = () => batches.flatMap((batch) => batch.batch);
  const traces = () => events().filter((item) => item.type === 'trace-create');
  /**
   * Locate the task-hierarchy observation that owns one Run.
   *
   * PR #7016 replaced the per-Run trace with a task trace
   * (`strategy-task:<taskExecutionId>`) whose `strategy-stage:<stage>` child
   * spans are keyed by `runId`, so a Run is found through its span rather than
   * by looking up a trace whose id is the run id.
   */
  const findTaskRunObservation = (runId: string): TaskRunObservation | null => {
    const span = events().find((item) => (
      item.type === 'span-create' &&
      typeof item.body.name === 'string' &&
      item.body.name.startsWith('strategy-stage:') &&
      item.body.metadata?.runId === runId
    ));
    if (!span) return null;
    const trace = traces().find((item) => item.body.id === span.body.traceId);
    if (!trace) return null;
    return { trace, span, taskExecutionId: span.body.metadata.taskExecutionId };
  };
  /**
   * Summarize everything ingestion actually received.
   *
   * A bare "timed out" tells you nothing about whether the daemon delivered a
   * different representation, delivered nothing at all, or delivered the right
   * span under a different Run — so every timeout carries this instead.
   */
  const describeReceived = (): string => JSON.stringify(events().map((item) => ({
    type: item.type,
    id: item.body.id,
    name: item.body.name,
    runId: item.body.metadata?.runId,
  })));
  return {
    url: `http://127.0.0.1:${address.port}`,
    batches,
    get traces() {
      return traces();
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    waitForTaskRunObservation: async (runId: string) => {
      const started = Date.now();
      while (Date.now() - started < 3000) {
        const found = findTaskRunObservation(runId);
        if (found) return found;
        await delay(50);
      }
      throw new Error(
        `timed out waiting for the task observation owning run ${runId}; `
        + `ingestion received ${describeReceived()}`,
      );
    },
    // Compatibility single-Run trace, still used by Runs the OD Next rollout
    // does not own (for example a runtime outside its capability gate).
    waitForSingleRunTrace: async (runId: string) => {
      const started = Date.now();
      while (Date.now() - started < 3000) {
        const found = traces().find((item) => item.body.id === runId);
        if (found) return found;
        await delay(50);
      }
      throw new Error(
        `timed out waiting for the single-Run trace ${runId}; `
        + `ingestion received ${describeReceived()}`,
      );
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

/**
 * Read a Run's durable event log once it is complete.
 *
 * The daemon emits `end` as a Run's final event and only then closes the log
 * write stream, so a log that already carries an `end` record carries every
 * earlier record too. Terminal Run status is published to `GET /api/runs/:id`
 * before that buffered write has necessarily reached disk, so sampling the file
 * the instant the status flips can classify a log whose error record is still
 * in flight. This waits for the log's own completion marker — not for the
 * assertion to pass, and not for a fixed delay.
 */
async function readCompletedRunEvents(file: string): Promise<RunEvent[]> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const events = await readRunEvents(file);
    if (events.some((event) => event.event === 'end')) return events;
    if (Date.now() >= deadline) {
      throw new Error(`run log ${file} never recorded a terminal end event`);
    }
    await delay(25);
  }
}

async function saveAssistantMessage(
  url: string,
  run: RunStatus,
  patch: Record<string, unknown> = {},
  telemetryFinalized = false,
): Promise<void> {
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
        ...patch,
        ...(telemetryFinalized ? { telemetryFinalized: true } : {}),
      }),
    },
  );
  expect(response.status).toBe(200);
}

async function finalizeAssistantMessage(
  url: string,
  run: RunStatus,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await saveAssistantMessage(url, run, patch, true);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
