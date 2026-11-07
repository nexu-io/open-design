import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';

// End-to-end coverage for OpenCode SDK (capture-style) session resume.
//
// The daemon hosts OpenCode in-process: a create turn mints an SDK session
// (`sessions.create` in the project directory) and captures its id; a
// follow-up turn continues it with `sessions.prompt` against the SAME id and
// sends only the new turn (no flattened-history resend). When the SDK
// session is gone (`Session not found`), the daemon clears the stale handle,
// transparently re-runs the same turn on a fresh session, and the user sees
// a succeeded turn — no error, no turn 3.
//
// The SDK host module is mocked at the daemon boundary: the mock records
// `create` / `prompt` calls (directory + session id + text) and replays
// CLI-shaped stream frames through the real `sdkEventToStreamRecords` +
// parser path, so this exercises resume wiring without a model backend.
// Background memory extraction shares the same mock; chat calls are
// distinguished by the project working dir (test projects are created as
// `opencode_resume_*`, memory runs in the daemon project root).
vi.mock('../src/runtimes/opencode-sdk-host.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/runtimes/opencode-sdk-host.js')>();
  const calls: {
    creates: Array<{ directory: string; init: unknown; sessionID: string }>;
    prompts: Array<{ sessionID: string; text: string }>;
  } = { creates: [], prompts: [] };
  // Session ids minted for chat (project-dir) sessions, in creation order.
  let created: string[] = [];
  // Prompt failures to inject, consumed in order.
  let promptFailures: Array<{ matchSession?: string; error: Error }> = [];
  // Frame sets scripted per chat prompt call, consumed in order.
  let queuedFrames: unknown[][] = [];
  // Live frames pending delivery to subscriber(s).
  let liveFrames: unknown[] = [];
  // Ids minted for chat sessions (project-dir creates).
  let chatSessionIds: string[] = [];
  const SESSION = 'ses_e2e0000resume0000';

  const framesFor = (sessionID: string, text: string): unknown[] => [
    { type: 'step_start', sessionID },
    { type: 'text', sessionID, part: { type: 'text', text } },
    {
      type: 'step_finish',
      sessionID,
      part: { type: 'step-finish', tokens: { input: 8, output: 2, reasoning: 0, cache: { read: 0, write: 0 } } },
    },
    { type: 'session.idle', data: { sessionID } },
  ];

  const isChatDir = (directory: string): boolean => directory.includes('opencode_resume_');

  async function* fakeSubscribe(): AsyncIterable<unknown> {
    for (;;) {
      const next = liveFrames.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  return {
    ...original,
    __mockState: { calls, SESSION },
    __mockReset(state?: { sessions?: string[] }) {
      calls.creates.length = 0;
      calls.prompts.length = 0;
      created = [...(state?.sessions ?? [SESSION])];
      promptFailures = [];
      queuedFrames = [];
      liveFrames = [];
      chatSessionIds = [];
    },
    __mockQueueFrames(frames: unknown[][]) {
      queuedFrames = frames;
    },
    __mockFailPromptOnce(failure: { matchSession?: string; error: Error }) {
      promptFailures.push(failure);
    },
    __mockFramesFor: framesFor,
    async acquireSharedSdkHost() {
      return { __fakeSdkHost: true };
    },
    async releaseSharedSdkHost() {},
    async createSdkSession(_host: unknown, directory: string, init?: unknown) {
      let sessionID: string;
      if (isChatDir(directory)) {
        sessionID = created.shift() ?? `ses_e2e_${randomUUID().slice(0, 8)}`;
        chatSessionIds.push(sessionID);
      } else {
        // Background (memory) session: never consumes scripted chat ids.
        sessionID = `ses_e2e_mem_${randomUUID().slice(0, 8)}`;
      }
      calls.creates.push({ directory, init, sessionID });
      return sessionID;
    },
    subscribeSdkEvents() {
      return fakeSubscribe();
    },
    async promptSdkSession(_host: unknown, input: { sessionID: string; text: string }) {
      const failure = promptFailures[0];
      if (failure && (!failure.matchSession || failure.matchSession === input.sessionID)) {
        promptFailures.shift();
        throw failure.error;
      }
      calls.prompts.push({ sessionID: input.sessionID, text: input.text });
      // Replay this call's scripted frames (chat sessions only — background
      // memory prompts get a default reply and never consume the script),
      // always terminated by `session.idle` so the subscriber loop completes.
      const isChat = chatSessionIds.includes(input.sessionID);
      const frames = isChat && queuedFrames.length > 0
        ? queuedFrames.shift()!
        : framesFor(input.sessionID, isChat ? 'Reply.' : 'Memory reply.');
      liveFrames.push(...frames);
      if (!frames.some((frame) => (frame as { type?: unknown })?.type === 'session.idle')) {
        liveFrames.push({ type: 'session.idle', data: { sessionID: input.sessionID } });
      }
      return { id: `inbox_${randomUUID().slice(0, 8)}` };
    },
  };
});

const mockHost = await import('../src/runtimes/opencode-sdk-host.js') as unknown as {
  __mockState: {
    calls: {
      creates: Array<{ directory: string; init: unknown; sessionID: string }>;
      prompts: Array<{ sessionID: string; text: string }>;
    };
    SESSION: string;
  };
  __mockReset: (state?: { sessions?: string[] }) => void;
  __mockQueueFrames: (frames: unknown[][]) => void;
  __mockFailPromptOnce: (failure: { matchSession?: string; error: Error }) => void;
  __mockFramesFor: (sessionID: string, text: string) => unknown[];
};

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

type RunEvent = { event: string; data: unknown };

const FIRST_REPLY_SENTINEL = 'FIRST_TURN_REPLY_SENTINEL_0c7d2';

/** Calls belonging to chat turns (project working dir), not background memory. */
function chatCalls() {
  const { calls } = mockHost.__mockState;
  const chatSessionIds = new Set(
    calls.creates.filter((c) => c.directory.includes('opencode_resume_')).map((c) => c.sessionID),
  );
  return {
    creates: calls.creates.filter((c) => c.directory.includes('opencode_resume_')),
    prompts: calls.prompts.filter((p) => chatSessionIds.has(p.sessionID)),
  };
}

describe('opencode native session resume', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;

  const SESSION = mockHost.__mockState.SESSION;

  beforeEach(() => {
    // These fixtures exercise session transport with plain replies, not OD Next state.
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'off';
    mockHost.__mockReset();
  });

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

  it('captures the session id on turn 1 and resumes it (without resending history) on turn 2', async () => {
    // Version-only binary: the SDK path never spawns it, but availability
    // probing still resolves the configured executable.
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-opencode-resume-bin-'));
    const bin = await writeVersionOnlyOpencode(binDir, 'opencode-capture');

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'opencode',
      agentCliEnv: { opencode: { OPENCODE_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);
    const projectId = conversationId.split('::')[0]!;

    mockHost.__mockQueueFrames([
      mockHost.__mockFramesFor(SESSION, FIRST_REPLY_SENTINEL),
      mockHost.__mockFramesFor(SESSION, 'Resumed reply.'),
    ]);
    const turn1 = await sendRunAndWait(started.url, conversationId, 'first user request');
    expect(turn1.status).toBe('succeeded');

    const turn2 = await sendRunAndWait(started.url, conversationId, 'second user request please');
    expect(turn2.status).toBe('succeeded');

    const { creates, prompts } = chatCalls();
    // One SDK session created (turn 1); turn 2 reuses it via `prompt`.
    expect(creates).toHaveLength(1);
    expect(prompts).toHaveLength(2);

    // The session lives in the project working dir.
    expect(creates[0]!.directory).toContain(projectId);

    // Both turns address the captured session id.
    expect(prompts[0]!.sessionID).toBe(SESSION);
    expect(prompts[1]!.sessionID).toBe(SESSION);

    // The turn-2 prompt must NOT re-send turn-1's assistant reply (history is
    // carried by the resumed session), but must carry the new user message.
    expect(prompts[1]!.text).not.toContain(FIRST_REPLY_SENTINEL);
    expect(prompts[1]!.text).toContain('second user request please');
    // And turn 1 carried the first request.
    expect(prompts[0]!.text).toContain('first user request');
  });

  it('transparently auto-reseeds within the same turn on `Session not found`', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-opencode-fallback-bin-'));
    const bin = await writeVersionOnlyOpencode(binDir, 'opencode-fallback');

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'opencode',
      agentCliEnv: { opencode: { OPENCODE_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);
    const FRESH = 'ses_e2e0000fresh0001';

    // Turn 1 creates normally.
    mockHost.__mockQueueFrames([mockHost.__mockFramesFor(SESSION, 'Created reply.')]);
    const turn1 = await sendRunAndWait(started.url, conversationId, 'first request');
    expect(turn1.status).toBe('succeeded');

    // Turn 2 resumes, but the SDK session is gone: the first `prompt` with
    // the stored id throws `Session not found`. The daemon must NOT surface
    // an error: it clears the dead handle and TRANSPARENTLY re-runs the same
    // turn on a fresh session (full transcript) within this one run.
    // (The SQLite-stored handle from turn 1 survives the call-log reset.)
    mockHost.__mockReset({ sessions: [FRESH] });
    mockHost.__mockFailPromptOnce({
      matchSession: SESSION,
      error: new Error('Session not found'),
    });
    // The stored handle (SESSION) comes from SQLite, not the mock: re-queue
    // fresh-session frames for the reseed prompt.
    mockHost.__mockQueueFrames([mockHost.__mockFramesFor(FRESH, 'Reseeded reply.')]);
    const turn2 = await sendRunAndWait(started.url, conversationId, 'second request');
    expect(turn2.status).toBe('succeeded');

    const events = await readRunEvents(turn2.eventsLogPath);
    expect(events.filter((e) => e.event === 'error')).toEqual([]);
    expect(hasDiagnostic(events, {
      type: 'agent_resume_auto_reseed',
      reason: 'resume_failed',
      stale_session_cleared: true,
    })).toBe(true);

    const { creates, prompts } = chatCalls();
    // The dead resume attempt is not recorded as a prompt (it threw before
    // recording); a fresh session was created and prompted once — all within
    // turn 2. (Turn 1's calls were cleared by the reset above.)
    expect(creates.map((c) => c.sessionID)).toEqual([FRESH]);
    expect(prompts.map((p) => p.sessionID)).toEqual([FRESH]);
  });

  it('creates the SDK session in the project working dir on turn 1', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-opencode-dir-bin-'));
    const bin = await writeVersionOnlyOpencode(binDir, 'opencode-dir');

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'opencode',
      agentCliEnv: { opencode: { OPENCODE_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversationId = await createConversation(started.url);
    const projectId = conversationId.split('::')[0]!;

    mockHost.__mockQueueFrames([mockHost.__mockFramesFor(SESSION, 'Reply.')]);
    const turn1 = await sendRunAndWait(started.url, conversationId, 'first request');
    expect(turn1.status).toBe('succeeded');

    const { creates, prompts } = chatCalls();
    expect(creates).toHaveLength(1);
    // `createSdkSession(location.directory=cwd)`: the SDK session is rooted
    // at the project working dir, which carries the project id.
    expect(creates[0]!.directory).toContain(projectId);
    expect(prompts[0]!.sessionID).toBe(SESSION);
  });
});

// Version-only fake opencode CLI: the SDK path never spawns it, but agent
// availability probing still resolves the configured executable.
async function writeVersionOnlyOpencode(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(
    bin,
    `#!/usr/bin/env node\n` +
      `const argv = process.argv.slice(2);\n` +
      `if (argv.includes('--version')) { console.log('1.17.7'); process.exit(0); }\n` +
      `if (argv[0] === 'models') { console.log('anthropic/claude-sonnet-4-5'); process.exit(0); }\n` +
      `process.exit(0);\n`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}

function snapshotEnv(): Record<string, string | undefined> {
  return {
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    OD_NEXT_STRATEGY_ROLLOUT: process.env.OD_NEXT_STRATEGY_ROLLOUT,
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
  const projectId = `opencode_resume_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'OpenCode resume smoke',
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
): Promise<RunStatus> {
  const [projectId, conversationId] = encoded.split('::');
  const assistantMessageId = `assistant_opencode_${randomUUID()}`;
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'opencode-resume-test',
      'x-od-analytics-session-id': 'opencode-resume-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId: `client_opencode_${randomUUID()}`,
      agentId: 'opencode',
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
  while (Date.now() - startedAt < 30_000) {
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

async function readRunEvents(eventsLogPath: string): Promise<RunEvent[]> {
  let raw = '';
  try {
    const { readFile } = await import('node:fs/promises');
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
