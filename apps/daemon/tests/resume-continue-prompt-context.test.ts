import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

/**
 * W2 red spec — "Continue the run" must never land in a session that has never
 * heard the original request.
 *
 * Two surfaces offer Continue on a resumable failed run, and they disagree with
 * the daemon about whether the session can actually be resumed:
 *
 *  - the client gate (`ChatPane.canResumeFailedRun`) is only
 *    `resumable && agentId === config.agentId`;
 *  - `od run continue` (cli.ts) is only `status.resumable === true`;
 *  - the daemon gate (`evaluateResumeInvalidation`) ALSO compares the stored
 *    model / cwd / cursor.
 *
 * So a user can fail a turn, change the model in Settings, and press Continue.
 * The daemon then rejects the stored session (`model_changed`) and opens a
 * FRESH one — and the only thing it is asked to send is the canonical continue
 * prompt, whose whole meaning ("continue it from where you left off ...
 * otherwise complete the original request") depends on the original request
 * being in context.
 *
 * Case 1 (CLI shape, `message` is the continue prompt alone) is the hole:
 * `composeChatUserRequestForAgent` takes `bodySource = message` on the
 * full-transcript path, so the fresh session receives the continue prompt with
 * no original request anywhere.
 *
 * Case 2 (web shape, `message` is the rendered transcript) is the control: it
 * documents the mechanism that saves the web client today, so a future change
 * that trims the transcript on this path goes red here instead of silently
 * reproducing case 1.
 */

const RESUME_CONTINUE_PROMPT =
  'The previous turn was interrupted by a transient failure. ' +
  'If your last response was cut off, continue it from where you left off ' +
  'and keep any work already completed; otherwise complete the original ' +
  'request. Inspect the current project files as needed before making ' +
  'further changes.';

const ORIGINAL_REQUEST =
  'Build the ORIGINAL_REQUEST_SENTINEL_9f31c pricing page with three tiers.';
const ORIGINAL_SENTINEL = 'ORIGINAL_REQUEST_SENTINEL_9f31c';

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
  eventsLogPath: string;
  resumable?: boolean;
  nativeSessionRecovery?: { state?: string; guardReason?: string | null };
};

type Invocation = { argv: string[]; stdin: string; cwd: string };

describe('resume continue prompt context', () => {
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

  it('carries the original request when a headless Continue turn cannot resume the session', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-w2-continue-cli-'));
    const { bin, logPath } = await writeResumableClaude(binDir, 'claude-w2-cli');

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: bin } },
      // Pin the starting model explicitly. The daemon data dir is shared across
      // the tests in this file, so an implicit "no model configured" start would
      // inherit whatever a previous test left in app config.
      agentModels: { claude: { model: 'claude-opus-4-5' } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const encoded = await createConversation(started.url);

    // Turn 1, headless shape (no client-pinned message ids): the daemon seeds
    // both the user and assistant rows itself, exactly as it does for a real
    // `od run start`. It commits a tool block, then drops with an upstream 503
    // → resumable failure, session persisted with the model used here.
    const failed = await postRun(started.url, encoded, {
      message: ORIGINAL_REQUEST,
      currentPrompt: ORIGINAL_REQUEST,
    });
    expect(failed.status).toBe('failed');
    expect(failed.resumable).toBe(true);

    // The user changes the model in Settings before pressing Continue. This is
    // the whole trigger: the daemon's resume guard compares the stored model.
    await putConfig(started.url, {
      agentModels: { claude: { model: 'claude-sonnet-4-5' } },
    });

    // Turn 2, exactly the `od run continue <runId>` request shape: the continue
    // prompt as `message`, no `currentPrompt`, no transcript — plus the flag
    // that declares the message is a directive rather than a request.
    const continued = await postRun(started.url, encoded, {
      message: RESUME_CONTINUE_PROMPT,
      resumeContinuation: true,
      analyticsHints: { entryFrom: 'resume_continue' },
    });
    expect(continued.status).toBe('succeeded');

    const chatTurns = await readChatTurns(logPath);
    expect(chatTurns).toHaveLength(2);
    const continueTurn = chatTurns[1]!;

    // Premise check: the daemon really did refuse the stored session, so this
    // is a brand-new session that has never seen turn 1.
    expect(continueTurn.argv).not.toContain('--resume');
    expect(continueTurn.argv).toContain('--session-id');

    // The continue directive arrives...
    expect(continueTurn.stdin).toContain('continue it from where you left off');

    // ...and so does the request it names. Without this the fresh session is
    // asked to "complete the original request" it has never seen.
    expect(continueTurn.stdin).toContain(ORIGINAL_SENTINEL);
  });

  it('carries the original request through the transcript on the web Continue shape', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-w2-continue-web-'));
    const { bin, logPath } = await writeResumableClaude(binDir, 'claude-w2-web');

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: bin } },
      // Pin the starting model explicitly. The daemon data dir is shared across
      // the tests in this file, so an implicit "no model configured" start would
      // inherit whatever a previous test left in app config.
      agentModels: { claude: { model: 'claude-opus-4-5' } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const encoded = await createConversation(started.url);

    const failed = await postRun(started.url, encoded, {
      message: ORIGINAL_REQUEST,
      currentPrompt: ORIGINAL_REQUEST,
    });
    expect(failed.status).toBe('failed');
    expect(failed.resumable).toBe(true);

    await putConfig(started.url, {
      agentModels: { claude: { model: 'claude-sonnet-4-5' } },
    });

    // The web client always ships BOTH shapes: `message` is the rendered
    // transcript, `currentPrompt` is only the latest turn. The daemon picks
    // `currentPrompt` when it resumes and `message` when it does not.
    const webTranscript = [
      '## user',
      ORIGINAL_REQUEST,
      '',
      '## assistant',
      'Starting on it.',
      '',
      '## user',
      RESUME_CONTINUE_PROMPT,
    ].join('\n');
    const continued = await postRun(started.url, encoded, {
      message: webTranscript,
      currentPrompt: RESUME_CONTINUE_PROMPT,
      assistantMessageId: `assistant_w2_${randomUUID()}`,
      analyticsHints: { entryFrom: 'resume_continue' },
    });
    expect(continued.status).toBe('succeeded');

    const chatTurns = await readChatTurns(logPath);
    expect(chatTurns).toHaveLength(2);
    const continueTurn = chatTurns[1]!;

    expect(continueTurn.argv).not.toContain('--resume');
    expect(continueTurn.stdin).toContain('continue it from where you left off');
    expect(continueTurn.stdin).toContain(ORIGINAL_SENTINEL);
  });
});

// Fake Claude CLI: attempt 1 commits a tool_use block (a real resume boundary)
// then dies with an upstream 503 (a resumable failure); later attempts succeed.
// Logs `{argv, stdin, cwd}` per chat invocation so the test can assert both the
// resume flag and the composed prompt the child actually received.
async function writeResumableClaude(
  dir: string,
  name: string,
): Promise<{ bin: string; logPath: string }> {
  const bin = path.join(dir, name);
  const counterPath = path.join(dir, `${name}-attempts`);
  const logPath = path.join(dir, `${name}-log.jsonl`);
  await writeFile(
    bin,
    `#!/usr/bin/env node
const fs = require('node:fs');
const counterPath = ${JSON.stringify(counterPath)};
const logPath = ${JSON.stringify(logPath)};
const argv = process.argv.slice(2);
if (argv.includes('--version')) { console.log('claude-code 1.0.0-w2-resume'); process.exit(0); }
if (argv.includes('--help')) { console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]'); process.exit(0); }
// Auxiliary daemon invocations (memory extraction / title generation) must not
// consume the chat-attempt counter or pollute the log.
if (!argv.includes('--session-id') && !argv.includes('--resume')) {
  process.stdout.write('{"entries":[]}');
  process.exit(0);
}
let stdin = '';
let done = false;
let timer = setTimeout(finish, 2000);
function finish() {
  if (done) return;
  done = true;
  clearTimeout(timer);
  try { fs.appendFileSync(logPath, JSON.stringify({ argv, stdin, cwd: process.cwd() }) + '\\n'); } catch {}
  run();
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  stdin += d;
  clearTimeout(timer);
  timer = setTimeout(finish, 120);
});
process.stdin.on('end', finish);
process.stdin.on('error', finish);
function run() {
  let attempts = 0;
  try { attempts = Number(fs.readFileSync(counterPath, 'utf8')) || 0; } catch {}
  fs.writeFileSync(counterPath, String(attempts + 1));
  console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-w2-test' }));
  if (attempts === 0) {
    console.log(JSON.stringify({
      type: 'assistant',
      message: {
        id: 'msg-w2-0',
        content: [{ type: 'tool_use', id: 'toolu_w2_0', name: 'Bash', input: { command: 'echo working' } }],
        stop_reason: 'tool_use'
      }
    }));
    process.stderr.write('Upstream request failed: HTTP 503 stream disconnected before completion.\\n');
    setTimeout(() => process.exit(1), 20);
    return;
  }
  console.log(JSON.stringify({
    type: 'assistant',
    message: {
      id: 'msg-w2-' + attempts,
      content: [{ type: 'text', text: 'Continued.' }],
      stop_reason: 'end_turn'
    }
  }));
  setTimeout(() => process.exit(0), 20);
}
`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return { bin, logPath };
}

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

function clearTelemetryEnv(): void {
  delete process.env.POSTHOG_KEY;
  delete process.env.POSTHOG_HOST;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_BASE_URL;
  delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function createConversation(url: string): Promise<string> {
  const projectId = `w2_resume_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'W2 resume continue smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = (await projectResponse.json()) as { conversationId: string };
  return `${projectId}::${projectBody.conversationId}`;
}

async function postRun(
  url: string,
  encoded: string,
  body: Record<string, unknown>,
): Promise<RunStatus> {
  const [projectId, conversationId] = encoded.split('::');
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'w2-resume-test',
      'x-od-analytics-session-id': 'w2-resume-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      clientRequestId: `client_w2_${randomUUID()}`,
      agentId: 'claude',
      ...body,
    }),
  });
  expect(runResponse.status).toBe(202);
  const created = (await runResponse.json()) as { runId: string };
  return await waitForRun(url, created.runId);
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
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

async function readChatTurns(logPath: string): Promise<Invocation[]> {
  let raw = '';
  try {
    raw = await readFile(logPath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Invocation);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
