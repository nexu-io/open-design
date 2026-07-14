// Regression (#5490): concurrent runs on one conversation must not fork the
// native agent session.
//
// Before the fix, the daemon had NO per-conversation concurrency guard. `POST
// /api/runs` and `POST /api/chat` both create-and-start a run unconditionally —
// no lookup of an already-active run on the same conversationId. The UI hides
// this by disabling the send button, but the HTTP API / `od` CLI / external
// agents (a first-class embedding surface per AGENTS.md) can fire two runs at
// the same conversation concurrently.
//
// A resume-capable agent (claude) persists exactly ONE native session per
// (conversation_id, agent_id) — that is the PRIMARY KEY of agent_sessions
// (db.ts:90-108), so upsertAgentSession (db.ts:1247-1280) is last-writer-wins.
// The resume context is resolved at the TOP of startChatRun (server.ts:4715) by
// a synchronous read of that row, but the row is only written at run SUCCESS
// (server.ts:5783 create-turn / 5809 resume-turn, gated by status==='succeeded'
// at 7696/7715) — i.e. at the very END of the run.
//
// Consequence (create-turn race): two concurrent runs on a FRESH conversation
// both read an empty session row, both resolve isResuming=false, and each mints
// and drives a DISTINCT native session (`claude --session-id <uuidA>` and
// `--session-id <uuidB>`). Both succeed and both upsert; the PK keeps only ONE
// row. A completed turn's native session is silently ORPHANED (lost update): the
// CLI did real work in that session (files read, tool history, working memory),
// but the daemon throws away the pointer to it. The next turn resumes the
// surviving session, which never saw the orphaned turn — silent context loss,
// while the DB transcript still shows both turns as if consistent.
//
// A/B: the ONLY difference below is concurrency.
//   - control (sequential): run 2 reads run 1's persisted session and RESUMES it
//     -> exactly ONE native session id is ever driven for the conversation.
//   - candidate (concurrent): the guard admits exactly one run (202) and rejects
//     the second with 409 CONVERSATION_BUSY, so only one native session is
//     driven. On main both are accepted (202) and fork the session — red.
//
// The fix: a per-conversation guard (routes/runs.ts `conversationHasActiveRun`)
// checked synchronously immediately before design.runs.create, so a second
// concurrent run on the same conversationId is refused instead of forking the
// single (conversation_id, agent_id) agent_sessions row.

import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = { id: string; status: string };

interface SpawnCapture {
  mode: 'resume' | 'create' | 'none';
  sessionId: string | null;
  cwd: string;
}

describe('concurrent run per-conversation guard (#5490)', () => {
  const originalEnv = {
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
    OD_TEST_SESSION_CAPTURE: process.env.OD_TEST_SESSION_CAPTURE,
  };
  let started: StartedServer | null = null;
  let workDir: string | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (workDir) await rm(workDir, { recursive: true, force: true });
    workDir = null;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('does not fork a conversation onto two native sessions under concurrent runs', async () => {
    workDir = await mkdtemp(path.join(os.tmpdir(), 'od-concurrent-session-'));
    const capturePath = path.join(workDir, 'spawn-capture.jsonl');
    const fakeClaude = await writeSessionCapturingClaude(workDir, 'claude-capture', capturePath);

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    process.env.OD_TEST_SESSION_CAPTURE = capturePath;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    // ---- A/B control: SEQUENTIAL runs on one conversation ------------------
    const controlProject = await createProject(started.url, 'seq');
    const seq1 = await startRun(started.url, controlProject);
    await waitForTerminal(started.url, seq1);
    const seq2 = await startRun(started.url, controlProject);
    await waitForTerminal(started.url, seq2);

    const controlCaptures = await readCapturesForProject(capturePath, controlProject.projectId);
    const controlSessions = new Set(controlCaptures.map((c) => c.sessionId).filter(Boolean));
    // Baseline: sequential run 2 resumes run 1's session — one native session.
    expect(controlCaptures.length).toBe(2);
    expect(controlSessions.size).toBe(1);
    expect(controlCaptures.some((c) => c.mode === 'resume')).toBe(true);

    // ---- Candidate: CONCURRENT runs on one conversation -------------------
    // The per-conversation guard admits exactly one run; the second concurrent
    // submit is rejected with 409 CONVERSATION_BUSY instead of racing into a
    // second native session. On main (no guard) both are accepted (202) and fork
    // the agent_sessions row — so the "exactly one 409" assertion goes red.
    const raceProject = await createProject(started.url, 'race');
    const [r1, r2] = await Promise.all([
      startRunRaw(started.url, raceProject),
      startRunRaw(started.url, raceProject),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses, `expected one 202 + one 409, got ${JSON.stringify([r1.status, r2.status])}`)
      .toEqual([202, 409]);

    const accepted = [r1, r2].find((r) => r.status === 202);
    await waitForTerminal(started.url, accepted!.runId!);

    // Only the admitted run drove claude, so exactly one native session exists —
    // no fork, no lost update.
    const raceCaptures = await readCapturesForProject(capturePath, raceProject.projectId);
    const raceSessions = new Set(raceCaptures.map((c) => c.sessionId).filter(Boolean));
    expect(raceCaptures.length).toBe(1);
    expect(raceSessions.size).toBe(1);
  });
});

async function writeSessionCapturingClaude(
  dir: string,
  name: string,
  capturePath: string,
): Promise<string> {
  const bin = path.join(dir, name);
  // Records the native session identity the daemon spawned it with (--resume
  // <id> = resuming an existing session; --session-id <id> = minting a new one),
  // then emits a clean successful stream-json turn and holds ~600ms before exit
  // so two racing runs are BOTH still resolving as create-turns (neither has
  // persisted its session yet). Synchronous writes so nothing is lost on exit.
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const argv = process.argv.slice(2);
function w(s) { fs.writeSync(1, s); }
if (argv.includes('--version')) { w('claude-code 1.0.0-session-capture\\n'); process.exit(0); }
if (argv.includes('--help')) { w('Usage: claude -p [--include-partial-messages] [--add-dir DIR]\\n'); process.exit(0); }

function argValue(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}
const resumeId = argValue('--resume');
const newId = argValue('--session-id');
const mode = resumeId ? 'resume' : newId ? 'create' : 'none';
const sessionId = resumeId || newId || null;
try {
  fs.appendFileSync(
    ${JSON.stringify(capturePath)},
    JSON.stringify({ mode, sessionId, cwd: process.cwd() }) + '\\n',
  );
} catch {}

const echo = sessionId || 'sess-unknown';
w(JSON.stringify({ type: 'system', subtype: 'init', model: 'm', session_id: echo }) + '\\n');
w(JSON.stringify({
  type: 'assistant',
  message: { id: 'msg-' + echo.slice(0, 8), content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' },
}) + '\\n');
w(JSON.stringify({
  type: 'result', subtype: 'success', is_error: false,
  session_id: echo, num_turns: 1, duration_api_ms: 10, total_cost_usd: 0,
}) + '\\n');
// Hold both racing runs alive as create-turns long enough that neither has
// persisted its session before the other resolves.
setTimeout(() => process.exit(0), 600);
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

async function readCapturesForProject(
  capturePath: string,
  projectId: string,
): Promise<SpawnCapture[]> {
  let raw = '';
  try {
    raw = await readFile(capturePath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SpawnCapture)
    .filter((c) => c.cwd.includes(projectId));
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function createProject(
  url: string,
  tag: string,
): Promise<{ projectId: string; conversationId: string }> {
  const projectId = `concurrent_${tag}_${randomUUID().replace(/-/g, '')}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: `Concurrent session repro ${tag}`,
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const body = await projectResponse.json() as { conversationId: string };
  return { projectId, conversationId: body.conversationId };
}

async function startRun(
  url: string,
  project: { projectId: string; conversationId: string },
): Promise<string> {
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'concurrent-session-test',
      'x-od-analytics-session-id': 'concurrent-session-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId: project.projectId,
      conversationId: project.conversationId,
      assistantMessageId: `assistant_${randomUUID()}`,
      clientRequestId: `client_${randomUUID()}`,
      agentId: 'claude',
      message: 'reproduce concurrent native session fork',
      currentPrompt: 'reproduce concurrent native session fork',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = await runResponse.json() as { runId: string };
  return body.runId;
}

// Like startRun but returns the HTTP status without asserting, so the concurrent
// case can observe that exactly one run is accepted (202) and the other is
// rejected (409 CONVERSATION_BUSY).
async function startRunRaw(
  url: string,
  project: { projectId: string; conversationId: string },
): Promise<{ status: number; runId?: string }> {
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'concurrent-session-test',
      'x-od-analytics-session-id': 'concurrent-session-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId: project.projectId,
      conversationId: project.conversationId,
      assistantMessageId: `assistant_${randomUUID()}`,
      clientRequestId: `client_${randomUUID()}`,
      agentId: 'claude',
      message: 'reproduce concurrent native session fork',
      currentPrompt: 'reproduce concurrent native session fork',
    }),
  });
  if (runResponse.status !== 202) return { status: runResponse.status };
  const body = await runResponse.json() as { runId: string };
  return { status: 202, runId: body.runId };
}

async function waitForTerminal(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (['failed', 'succeeded', 'canceled'].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`run ${runId} did not finish`);
}
