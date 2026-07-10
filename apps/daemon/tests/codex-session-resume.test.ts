import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import { writeMcpConfig } from '../src/mcp-config.js';
import { clearToken, setToken } from '../src/mcp-tokens.js';

// End-to-end coverage for codex native (capture-style) session resume.
//
// codex mints its OWN session id and reports it on the first stream event
// `{"type":"thread.started","thread_id":...}`. The daemon must:
//   1. capture that thread id from the stream and persist it (NOT the
//      daemon-minted `newSessionId`, which codex ignores),
//   2. on the next turn in the same conversation, resume with
//      `codex exec resume <thread_id>` and send ONLY the new turn (no
//      flattened-history resend), and
//   3. when the stored thread is gone (`no rollout found for thread id`),
//      clear the stale handle, surface a retryable error, and let the next
//      turn start a fresh session re-seeded with the full transcript.
//
// On origin/main codex is not `resumesSessionViaCli`, so it always runs plain
// `exec` and re-pays the whole transcript — turn-2 here would carry no
// `resume` and would include the prior reply, going red.

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
};

type ExecInvocation = { argv: string[]; stdin: string; cwd: string };
type RunEvent = { event: string; data: unknown };

const THREAD = '019eef4f-0000-7000-8000-000000000abc';
const FIRST_REPLY_SENTINEL = 'FIRST_TURN_REPLY_SENTINEL_8af31';

describe('codex native session resume', () => {
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
    // The MCP-directive red-spec below writes an authenticated `github` server
    // into the process-wide OD_DATA_DIR (tests/setup.ts shares one root for the
    // whole daemon Vitest run). Reset it after every test so that state cannot
    // leak into later test files and make them suite-order dependent.
    // `writeMcpConfig` unconditionally overwrites to an empty server list and
    // `clearToken` is a documented no-op when the entry is absent, so neither
    // needs to tolerate "nothing was written" — let a real teardown failure
    // surface instead of silently degrading the isolation guarantee.
    const dataDir = process.env.OD_DATA_DIR;
    if (dataDir) {
      await writeMcpConfig(dataDir, { servers: [] });
      await clearToken(dataDir, 'github');
    }
  });

  it('captures the thread id on turn 1 and resumes it (without resending history) on turn 2', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-codex-resume-bin-'));
    const { bin, logPath } = await writeCapturingCodex(binDir, 'codex-capture');

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'codex',
      agentCliEnv: { codex: { CODEX_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    const turn1 = await sendRunAndWait(started.url, conversationId, 'first user request');
    expect(turn1.status).toBe('succeeded');

    const turn2 = await sendRunAndWait(started.url, conversationId, 'second user request please');
    expect(turn2.status).toBe('succeeded');

    // Filter to this conversation's chat-turn `exec` calls (cwd points at its
    // project dir). codex is also used as the daemon's background memory-llm and
    // for `login status` / `debug models` probes — those run from the repo root
    // and must not be counted as chat turns.
    const runs = await readChatTurnExecs(logPath, conversationId);
    expect(runs).toHaveLength(2);
    const [create, resume] = runs as [ExecInvocation, ExecInvocation];

    // Turn 1 is a fresh `exec` — no resume, no leaked id.
    expect(create.argv).toContain('exec');
    expect(create.argv).not.toContain('resume');
    expect(create.argv).not.toContain(THREAD);

    // Turn 2 resumes the captured thread id as the trailing positional arg.
    expect(resume.argv.slice(0, 2)).toEqual(['exec', 'resume']);
    expect(resume.argv[resume.argv.length - 1]).toBe(THREAD);
    // Resume must pass sandbox via `-c`, never the `--sandbox` flag (rejected
    // by `exec resume`).
    expect(resume.argv).not.toContain('--sandbox');

    // The turn-2 prompt must NOT re-send turn-1's assistant reply (history is
    // carried by the resumed session), but must carry the new user message.
    expect(resume.stdin).not.toContain(FIRST_REPLY_SENTINEL);
    expect(resume.stdin).toContain('second user request please');
  });

  it('transparently auto-reseeds within the same turn on `no rollout found`', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-codex-fallback-bin-'));
    const { bin, logPath } = await writeMissingRolloutCodex(binDir, 'codex-fallback');

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'codex',
      agentCliEnv: { codex: { CODEX_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    // Turn 1 creates + persists the thread.
    const turn1 = await sendRunAndWait(started.url, conversationId, 'first request');
    expect(turn1.status).toBe('succeeded');

    // Turn 2 resumes, but the rollout is gone (`no rollout found`). The daemon
    // must NOT surface an error: it clears the dead thread and TRANSPARENTLY
    // re-runs the same turn as a fresh `exec` (full transcript), within this one
    // run. The user sees a succeeded turn — no "resend" prompt, no turn 3.
    const turn2 = await sendRunAndWait(started.url, conversationId, 'second request');
    expect(turn2.status).toBe('succeeded');

    const events = await readRunEvents(turn2.eventsLogPath);
    expect(events.filter((e) => e.event === 'error')).toEqual([]);
    expect(hasDiagnostic(events, {
      type: 'agent_resume_auto_reseed',
      reason: 'resume_failed',
      stale_session_cleared: true,
    })).toBe(true);

    // Two execs happened inside turn 1+2: the create, then turn 2's dead
    // `exec resume`, then the in-turn fresh `exec` reseed.
    const runs = await readChatTurnExecs(logPath, conversationId);
    expect(runs).toHaveLength(3);
    const [create, deadResume, fresh] = runs as [
      ExecInvocation,
      ExecInvocation,
      ExecInvocation,
    ];
    expect(create.argv).not.toContain('resume');
    expect(deadResume.argv.slice(0, 2)).toEqual(['exec', 'resume']);
    expect(fresh.argv).not.toContain('resume');
  });

  it('starts fresh on turn 2 when turn 1 succeeds without a captured thread id', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-codex-nohandle-bin-'));
    const { bin, logPath } = await writeNoHandleCodex(binDir, 'codex-nohandle');

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'codex',
      agentCliEnv: { codex: { CODEX_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    expect((await sendRunAndWait(started.url, conversationId, 'first request')).status)
      .toBe('succeeded');
    expect((await sendRunAndWait(started.url, conversationId, 'second request')).status)
      .toBe('succeeded');

    const runs = await readChatTurnExecs(logPath, conversationId);
    expect(runs).toHaveLength(2);
    const [turn1, turn2] = runs as [ExecInvocation, ExecInvocation];
    expect(turn1.argv).not.toContain('resume');
    expect(turn2.argv[0]).toBe('exec');
    expect(turn2.argv).not.toContain('resume');
  });

  it('reseeds (no resume) when another agent ran in the conversation between codex turns', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-codex-intervene-bin-'));
    const { bin, logPath } = await writeCapturingCodex(binDir, 'codex-intervene');
    const claudeBin = await writeMinimalClaude(binDir, 'claude-intervene');

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'codex',
      agentCliEnv: { codex: { CODEX_BIN: bin }, claude: { CLAUDE_BIN: claudeBin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);

    // Turn 1: codex creates + persists its session.
    expect((await sendRunAndWait(started.url, conversationId, 'codex first', 'codex')).status)
      .toBe('succeeded');
    // Turn 2: a DIFFERENT agent runs, adding a completed assistant turn that the
    // codex session never saw.
    expect((await sendRunAndWait(started.url, conversationId, 'now claude', 'claude')).status)
      .toBe('succeeded');
    // Turn 3: codex returns. Its stored session is behind, so the daemon must
    // start a fresh `exec` (and reseed the full transcript) — NOT resume the
    // stale session and silently drop the intervening claude turn.
    expect((await sendRunAndWait(started.url, conversationId, 'codex again', 'codex')).status)
      .toBe('succeeded');

    const runs = await readChatTurnExecs(logPath, conversationId);
    expect(runs).toHaveLength(2); // only the two codex turns hit the codex bin
    const [create, afterIntervening] = runs as [ExecInvocation, ExecInvocation];
    expect(create.argv).not.toContain('resume');
    // The headline guard (issue raised by @nettee): after a different agent
    // completed a turn the codex session never saw, codex must NOT resume that
    // stale session — it starts a fresh `exec` so the run is reseeded with the
    // full transcript instead of silently dropping the intervening turn.
    expect(afterIntervening.argv).not.toContain('resume');
    expect(afterIntervening.argv[0]).toBe('exec');
  });

  // Guards the fix that moved the connected-external-MCP directive out of the
  // cached `daemonSystemPrompt` and into the per-turn instruction slice. The
  // directive reflects live OAuth Bearer validity, so keeping it in the cached
  // prefix churned the whole prompt-cache prefix (history included) whenever a
  // token expired mid-conversation. Now it must ride in the per-turn slice, i.e.
  // be re-sent on EVERY turn — including a clean resume, which never re-sends the
  // cached stable block. On origin/main the directive lived in the stable block,
  // so a clean resume dropped it and the turn-2 assertion below goes red.
  it('re-sends the connected-MCP directive in the per-turn slice on resume turns', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-codex-mcp-bin-'));
    const { bin, logPath } = await writeCapturingCodex(binDir, 'codex-mcp');

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'codex',
      agentCliEnv: { codex: { CODEX_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    // A connected external MCP server = enabled config + a live (non-expired)
    // OAuth Bearer. That is exactly what makes the daemon render the
    // "already authenticated" directive.
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for the MCP directive test');
    await writeMcpConfig(dataDir, {
      servers: [
        {
          id: 'github',
          label: 'GitHub',
          transport: 'http',
          url: 'https://mcp.test.invalid/github',
          enabled: true,
        },
      ],
    });
    await setToken(dataDir, 'github', {
      accessToken: 'live-access-token',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3_600_000,
      savedAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);
    const turn1 = await sendRunAndWait(started.url, conversationId, 'first user request');
    expect(turn1.status).toBe('succeeded');
    const turn2 = await sendRunAndWait(
      started.url,
      conversationId,
      'second user request please',
    );
    expect(turn2.status).toBe('succeeded');

    const runs = await readChatTurnExecs(logPath, conversationId);
    expect(runs).toHaveLength(2);
    const [create, resume] = runs as [ExecInvocation, ExecInvocation];

    const MCP_MARKER = 'External MCP servers — already authenticated';
    // A marker that only appears inside the cached stable block (daemonSystemPrompt).
    const STABLE_BLOCK_MARKER = '# Identity and workflow charter (background)';

    // Turn 1 (fresh seed) carries the directive.
    expect(create.stdin).toContain(MCP_MARKER);
    expect(create.stdin).toContain('`github`');

    // Turn 2 is a clean resume: the cached stable block is NOT re-sent...
    expect(resume.argv.slice(0, 2)).toEqual(['exec', 'resume']);
    expect(resume.stdin).not.toContain(STABLE_BLOCK_MARKER);
    // ...but the MCP directive IS, because it now lives in the per-turn slice.
    expect(resume.stdin).toContain(MCP_MARKER);
    expect(resume.stdin).toContain('`github`');
  });
});

// Minimal fake Claude CLI (claude-stream-json): emits an init frame + one
// assistant text reply and exits 0. Used only to inject an intervening
// completed turn from a different agent.
async function writeMinimalClaude(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(
    bin,
    `#!/usr/bin/env node
const argv = process.argv.slice(2);
if (argv.includes('--version')) { console.log('claude-code 1.0.0-intervene'); process.exit(0); }
if (argv.includes('--help')) { console.log('Usage: claude -p'); process.exit(0); }
console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-intervene' }));
console.log(JSON.stringify({ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'CLAUDE_INTERVENING_REPLY' }], stop_reason: 'end_turn' } }));
setTimeout(() => process.exit(0), 10);
`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}

// Fake codex CLI: mints a FIXED thread id on a create turn and echoes it on a
// resume turn. Logs `{argv, stdin}` per invocation so the test can assert the
// resume shape and the skipped transcript.
async function writeCapturingCodex(
  dir: string,
  name: string,
): Promise<{ bin: string; logPath: string }> {
  const bin = path.join(dir, name);
  const logPath = path.join(dir, `${name}-log.jsonl`);
  await writeFile(
    bin,
    fakeCodexSource({
      logPath,
      body: `
  const isResume = argv.includes('resume');
  console.log(JSON.stringify({ type: 'thread.started', thread_id: THREAD }));
  console.log(JSON.stringify({ type: 'turn.started' }));
  const text = isResume ? 'Resumed reply.' : ${JSON.stringify(FIRST_REPLY_SENTINEL)};
  console.log(JSON.stringify({ type: 'item.completed', item: { id: 'item-1', type: 'agent_message', text } }));
  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 3 } }));
  setTimeout(() => process.exit(0), 10);`,
    }),
    'utf8',
  );
  await chmod(bin, 0o755);
  return { bin, logPath };
}

// Fake codex CLI: succeeds on a create turn (persisting the thread), but a
// resume turn fails with codex's real "no rollout found" error and exits 1.
async function writeMissingRolloutCodex(
  dir: string,
  name: string,
): Promise<{ bin: string; logPath: string }> {
  const bin = path.join(dir, name);
  const logPath = path.join(dir, `${name}-log.jsonl`);
  await writeFile(
    bin,
    fakeCodexSource({
      logPath,
      body: `
  if (argv.includes('resume')) {
    process.stderr.write('Error: thread/resume: thread/resume failed: no rollout found for thread id ' + THREAD + '\\n');
    setTimeout(() => process.exit(1), 10);
    return;
  }
  console.log(JSON.stringify({ type: 'thread.started', thread_id: THREAD }));
  console.log(JSON.stringify({ type: 'turn.started' }));
  console.log(JSON.stringify({ type: 'item.completed', item: { id: 'item-1', type: 'agent_message', text: 'Created reply.' } }));
  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 8, cached_input_tokens: 0, output_tokens: 2 } }));
  setTimeout(() => process.exit(0), 10);`,
    }),
    'utf8',
  );
  await chmod(bin, 0o755);
  return { bin, logPath };
}

// Fake codex CLI: succeeds but never reports `thread.started.thread_id`.
// Without a durable handle, the daemon must leave the next turn on fresh `exec`.
async function writeNoHandleCodex(
  dir: string,
  name: string,
): Promise<{ bin: string; logPath: string }> {
  const bin = path.join(dir, name);
  const logPath = path.join(dir, `${name}-log.jsonl`);
  await writeFile(
    bin,
    fakeCodexSource({
      logPath,
      body: `
  console.log(JSON.stringify({ type: 'thread.started' }));
  console.log(JSON.stringify({ type: 'turn.started' }));
  console.log(JSON.stringify({ type: 'item.completed', item: { id: 'item-1', type: 'agent_message', text: 'Reply without thread id.' } }));
  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 8, cached_input_tokens: 0, output_tokens: 2 } }));
  setTimeout(() => process.exit(0), 10);`,
    }),
    'utf8',
  );
  await chmod(bin, 0o755);
  return { bin, logPath };
}

function fakeCodexSource(opts: { logPath: string; body: string }): string {
  return `#!/usr/bin/env node
const fs = require('node:fs');
const logPath = ${JSON.stringify(opts.logPath)};
const THREAD = ${JSON.stringify(THREAD)};
const argv = process.argv.slice(2);
if (argv.includes('--version')) { console.log('codex-cli 0.133.0'); process.exit(0); }
if (argv.includes('--help')) { console.log('Usage: codex exec [--sandbox MODE]'); process.exit(0); }
let stdin = '';
let done = false;
function finish() {
  if (done) return; done = true;
  try { fs.appendFileSync(logPath, JSON.stringify({ argv, stdin, cwd: process.cwd() }) + '\\n'); } catch {}
  run();
}
function run() {
  // Faithful to the real CLI: codex exec resume rejects the create-only
  // -C / --add-dir flags. If the daemon ever appends them on a resume turn,
  // die exactly like the real binary so the e2e catches the regression.
  if (argv.includes('resume') && (argv.includes('-C') || argv.includes('--add-dir'))) {
    process.stderr.write("error: unexpected argument '-C' found\\n");
    setTimeout(() => process.exit(2), 10);
    return;
  }${opts.body}
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { stdin += d; });
process.stdin.on('end', finish);
process.stdin.on('error', finish);
setTimeout(finish, 1500);
`;
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
  const projectId = `codex_resume_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Codex resume smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = (await projectResponse.json()) as {
    conversationId: string;
    id: string;
  };
  return `${projectId}::${projectBody.conversationId}`;
}

async function sendRunAndWait(
  url: string,
  encoded: string,
  message: string,
  agentId = 'codex',
): Promise<RunStatus> {
  const [projectId, conversationId] = encoded.split('::');
  const assistantMessageId = `assistant_codex_${randomUUID()}`;
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'codex-resume-test',
      'x-od-analytics-session-id': 'codex-resume-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId: `client_codex_${randomUUID()}`,
      agentId,
      message,
      currentPrompt: message,
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = (await runResponse.json()) as { runId: string };
  return await waitForRun(url, body.runId);
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

// Chat-turn `exec` invocations for this conversation, in call order. Identified
// by the chat turn's cwd (the project working dir, which contains the project
// id) — this drops the background memory-llm exec (repo-root cwd) and the
// login/models probes. The cwd is set via the spawn, not an argv flag, and on a
// resume turn there is no `-C` to key off, so cwd is the reliable discriminator.
async function readChatTurnExecs(
  logPath: string,
  encoded: string,
): Promise<ExecInvocation[]> {
  const projectId = encoded.split('::')[0] ?? encoded;
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
    .map((line) => JSON.parse(line) as ExecInvocation)
    .filter(
      (rec) =>
        rec.argv[0] === 'exec' &&
        typeof rec.cwd === 'string' &&
        rec.cwd.includes(projectId),
    );
}

async function readRunEvents(eventsLogPath: string): Promise<RunEvent[]> {
  let raw = '';
  try {
    raw = await readFile(eventsLogPath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunEvent);
}

function hasDiagnostic(events: RunEvent[], expected: Record<string, unknown>): boolean {
  return events.some((event) => {
    if (event.event !== 'diagnostic' || !event.data || typeof event.data !== 'object') {
      return false;
    }
    return Object.entries(expected).every(
      ([key, value]) => (event.data as Record<string, unknown>)[key] === value,
    );
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
