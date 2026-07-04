// Authors: Leon Aburime using Claude Sonnet 4.6
//
// Golden / characterization tests for the SSE event shapes emitted by startChatRun.
// These exist to catch regressions when the function is extracted from server.ts into
// its own module. They pin the event *type* sequence and key *data* fields without
// asserting on dynamic values (runId, timestamps, etc.).
//
// Test matrix:
//   1. Happy path (claude, text output)   → start / agent text_delta / end, status = succeeded
//   2. Agent error frame (opencode)       → error event, status = failed
//   3. Binary not on PATH                 → AGENT_UNAVAILABLE error, status = failed
//   4. SSE id monotonic counter           → id fields are present and increasing
//
// Event vocabulary (current daemon): `start` (run accepted), `agent` (decoded
// agent stream events, text as { type: 'text_delta', delta }), `error`
// (createSseErrorPayload shape), and terminal `end` with
// { code, signal, status, resumable } from the runs service's finish().
import type http from 'node:http';
import { promises as fsp } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SseFrame {
  id: string | null;
  event: string;
  data: unknown;
}

function parseSseFrames(body: string): SseFrame[] {
  const frames: SseFrame[] = [];
  for (const block of body.split('\n\n')) {
    const lines = block.trim().split('\n');
    if (lines.length === 0 || !lines.some((l) => l.startsWith('event:'))) continue;
    let id: string | null = null;
    let event = '';
    let dataRaw = '';
    for (const line of lines) {
      if (line.startsWith('id:')) id = line.slice(3).trim();
      else if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataRaw = line.slice(5).trim();
    }
    if (!event) continue;
    let data: unknown = dataRaw;
    try { data = JSON.parse(dataRaw); } catch { /* leave as string */ }
    frames.push({ id, event, data });
  }
  return frames;
}

async function readSseUntil(response: Response, marker: string, maxChunks = 60): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let body = '';
  try {
    for (let i = 0; i < maxChunks; i++) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
      // Stop only once the frame carrying the marker is COMPLETE: the marker
      // text has appeared AND a blank-line terminator (`\n\n`) follows it, so
      // the frame's `data:` line is fully buffered. Breaking on the bare marker
      // races SSE chunk boundaries — the `event:` line can arrive one chunk
      // before its `data:` line — which would hand parseSseFrames a half-written
      // frame and make callers' JSON-field assertions spuriously fail.
      const markerIdx = body.indexOf(marker);
      if (markerIdx !== -1 && body.indexOf('\n\n', markerIdx) !== -1) break;
    }
  } finally {
    // Release so a follow-up readSseUntil on the same response can resume
    // the stream (getReader() throws on a locked stream otherwise).
    reader.releaseLock();
  }
  return body;
}

async function waitForRunStatus(
  baseUrl: string,
  runId: string,
  done: (s: string) => boolean = (s) => s !== 'queued' && s !== 'running',
  maxAttempts = 500,
): Promise<{ status: string }> {
  let last = 'unknown';
  for (let i = 0; i < maxAttempts; i++) {
    const r = await fetch(`${baseUrl}/api/runs/${runId}`);
    const b = await r.json() as { status: string };
    last = b.status;
    if (done(b.status)) return b;
    await new Promise((res) => setTimeout(res, 25));
  }
  throw new Error(`run did not reach terminal status; last: ${last}`);
}

async function withFakeAgent<T>(
  binName: string,
  script: string,
  run: () => Promise<T>,
): Promise<T> {
  const dir = await fsp.mkdtemp(join(tmpdir(), 'od-sse-shapes-'));
  const oldPath = process.env.PATH;
  try {
    if (process.platform === 'win32') {
      const runner = join(dir, `${binName}-runner.cjs`);
      await fsp.writeFile(runner, script);
      await fsp.writeFile(join(dir, `${binName}.cmd`), `@echo off\r\nnode "${runner}" %*\r\n`);
    } else {
      const bin = join(dir, binName);
      await fsp.writeFile(bin, `#!/usr/bin/env node\n${script}`);
      await fsp.chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${delimiter}${oldPath ?? ''}`;
    return await run();
  } finally {
    process.env.PATH = oldPath;
    killAgent(dir);
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

function killAgent(pathFragment: string) {
  if (process.platform === 'win32') return;
  try {
    const pids = execFileSync('pgrep', ['-f', pathFragment], { encoding: 'utf8' });
    for (const line of pids.split('\n')) {
      const pid = Number(line.trim());
      if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
      try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /**/ } }
    }
  } catch { /**/ }
}

// Minimal claude stream-json that produces one text block and exits cleanly.
//
// IMPORTANT: the daemon sends claude's prompt as one JSONL user message and
// KEEPS STDIN OPEN for mid-turn input (promptInputFormat 'stream-json'; see
// AGENTS.md "Agent runtime conventions"). A script that waits for stdin 'end'
// before emitting deadlocks against that convention, so respond to the first
// stdin *line* instead.
const CLAUDE_HAPPY_SCRIPT = `
const lines = [
  JSON.stringify({ type: 'stream_event', event: { type: 'message_start', message: { id: 'msg-golden' }, ttft_ms: 5 } }),
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text' } } }),
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'golden output' } } }),
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 } }),
  JSON.stringify({ type: 'result', usage: { input_tokens: 1, output_tokens: 3 }, duration_ms: 50, stop_reason: 'end_turn' }),
];
let responded = false;
const respond = () => {
  if (responded) return;
  responded = true;
  for (const l of lines) console.log(l);
  process.exit(0);
};
process.stdin.setEncoding('utf8');
process.stdin.on('data', respond);
process.stdin.on('end', respond);
`;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('startChatRun SSE event shapes (golden)', () => {
  let server: http.Server;
  let baseUrl: string;
  const originalPath = process.env.PATH;

  beforeAll(async () => {
    // Isolate BEFORE importing the server module: server.ts resolves
    // RUNTIME_DATA_DIR from OD_DATA_DIR at module load (daemon data directory
    // contract), and OD_AGENT_HOME scopes binary detection to a sandbox home
    // so resolveOnPath's user-toolchain fallback dirs (~/.npm-global, brew, …)
    // never leak the host's real agent binaries into these golden runs.
    const dataDir = await fsp.mkdtemp(join(tmpdir(), 'od-sse-shapes-data-'));
    const agentHome = await fsp.mkdtemp(join(tmpdir(), 'od-sse-shapes-home-'));
    process.env.OD_DATA_DIR = dataDir;
    process.env.OD_AGENT_HOME = agentHome;
    const { startServer } = await import('../src/server.js');
    const started = await startServer({ port: 0, returnServer: true }) as { url: string; server: http.Server };
    baseUrl = started.url;
    server = started.server;
  }, 60_000);

  afterAll(async () => {
    if (server) await new Promise<void>((res) => server.close(() => res()));
  });

  afterEach(() => {
    process.env.PATH = originalPath;
  });

  // ─── 1. Happy path ───────────────────────────────────────────────────────

  it('happy path: emits start → text_delta → end events and run reaches succeeded', async () => {
    await withFakeAgent('claude', CLAUDE_HAPPY_SCRIPT, async () => {
      const createRes = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'claude', message: 'golden test' }),
      });
      expect(createRes.status).toBe(202);
      const { runId } = await createRes.json() as { runId: string };

      const eventsRes = await fetch(`${baseUrl}/api/runs/${runId}/events`);
      const body = await readSseUntil(eventsRes, 'event: end');
      const frames = parseSseFrames(body);
      const eventTypes = frames.map((f) => f.event);

      // Streamed text arrives as `agent` frames carrying
      // { type: 'text_delta', delta } (see emitGuardedTextDelta in server.ts).
      const isTextDelta = (f: SseFrame) =>
        f.event === 'agent' &&
        (f.data as { type?: string })?.type === 'text_delta';
      const textFrames = frames.filter(isTextDelta);
      expect(textFrames.length).toBeGreaterThan(0);
      const allText = textFrames
        .map((f) => (f.data as { delta?: string })?.delta ?? '')
        .join('');
      expect(allText).toContain('golden output');

      // Must end with a terminal `end` event whose status is succeeded.
      const endFrame = [...frames].reverse().find((f) => f.event === 'end');
      expect(endFrame).toBeTruthy();
      expect((endFrame!.data as { status?: string })?.status).toBe('succeeded');

      // start must appear before the first text delta, which must appear
      // before end.
      const startIdx = eventTypes.indexOf('start');
      const firstTextIdx = frames.findIndex(isTextDelta);
      const endIdx = eventTypes.lastIndexOf('end');
      expect(startIdx).toBeGreaterThanOrEqual(0);
      expect(firstTextIdx).toBeGreaterThan(startIdx);
      expect(endIdx).toBeGreaterThan(firstTextIdx);

      const status = await waitForRunStatus(baseUrl, runId);
      expect(status.status).toBe('succeeded');
    });
  }, 60_000);

  // ─── 2. Agent error frame ────────────────────────────────────────────────

  it('agent error frame: emits SSE error event and run reaches failed', async () => {
    await withFakeAgent(
      'opencode',
      `
console.log(JSON.stringify({ type: 'error', error: { message: 'golden-error: model unavailable' } }));
process.exit(0);
`,
      async () => {
        const createRes = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: 'opencode', message: 'golden test' }),
        });
        expect(createRes.status).toBe(202);
        const { runId } = await createRes.json() as { runId: string };

        // Read through the terminal `end` frame in one pass so the parsed body
        // carries BOTH the error frame and the terminal frame — then assert the
        // SSE shapes directly instead of discarding the stream and trusting only
        // the /api/runs record (which would still pass if the terminal SSE frame
        // were missing or malformed).
        const eventsRes = await fetch(`${baseUrl}/api/runs/${runId}/events`);
        const body = await readSseUntil(eventsRes, 'event: end');
        const frames = parseSseFrames(body);

        const errorFrame = frames.find((f) => f.event === 'error');
        expect(errorFrame).toBeTruthy();
        // SSE error payload shape is createSseErrorPayload's:
        // { message, error: { code, message, ... } } — code nests under error.
        const errData = errorFrame!.data as {
          message?: string;
          error?: { code?: string; message?: string };
        };
        expect(errData.error?.code).toBe('AGENT_EXECUTION_FAILED');
        expect(errData.message).toContain('golden-error');

        // Terminal `end` frame must itself reflect failure.
        const endFrame = [...frames].reverse().find((f) => f.event === 'end');
        expect(endFrame).toBeTruthy();
        expect((endFrame!.data as { status?: string })?.status).toBe('failed');

        const status = await waitForRunStatus(baseUrl, runId);
        expect(status.status).toBe('failed');
      },
    );
  }, 60_000);

  // ─── 3. Binary not on PATH ───────────────────────────────────────────────

  it('missing binary: emits AGENT_UNAVAILABLE error event immediately', async () => {
    // Emptying PATH alone is NOT enough: resolveOnPath also walks the user
    // toolchain dirs (~/.npm-global, Homebrew, version managers), so a host
    // with claude installed would still resolve it. OD_AGENT_HOME (set in
    // beforeAll) scopes those fallback dirs to an empty sandbox home, which
    // makes an empty PATH mean "no binary anywhere detection looks".
    process.env.PATH = '';

    // Use /api/chat direct response (synchronous SSE body) for simpler assertion.
    const chatRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'claude', message: 'golden test' }),
    });
    const body = await chatRes.text();
    const frames = parseSseFrames(body);

    // Assert the actual error frame shape, not just a raw substring — a raw
    // grep would still pass if the daemon emitted AGENT_UNAVAILABLE in the wrong
    // frame or field.
    const errorFrame = frames.find((f) => f.event === 'error');
    expect(errorFrame).toBeTruthy();
    const errData = errorFrame!.data as { error?: { code?: string } };
    expect(errData.error?.code).toBe('AGENT_UNAVAILABLE');

    // Terminal `end` frame (if the path emits one) must reflect failure, and no
    // frame may report success.
    const endFrame = [...frames].reverse().find((f) => f.event === 'end');
    expect(endFrame).toBeTruthy();
    expect((endFrame!.data as { status?: string })?.status).toBe('failed');
  }, 60_000);

  // ─── 4. SSE id counter ───────────────────────────────────────────────────

  it('SSE id counter: event ids are numeric strings and monotonically increasing', async () => {
    await withFakeAgent('claude', CLAUDE_HAPPY_SCRIPT, async () => {
      const createRes = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'claude', message: 'golden test ids' }),
      });
      expect(createRes.status).toBe(202);
      const { runId } = await createRes.json() as { runId: string };

      const eventsRes = await fetch(`${baseUrl}/api/runs/${runId}/events`);
      const body = await readSseUntil(eventsRes, 'event: end');
      const frames = parseSseFrames(body);

      const ids = frames
        .map((f) => f.id)
        .filter((id): id is string => id !== null)
        .map(Number);

      // At least a few events should carry ids.
      expect(ids.length).toBeGreaterThan(0);
      // All ids must be valid numbers.
      expect(ids.every(Number.isFinite)).toBe(true);
      // Ids must be monotonically non-decreasing.
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]!).toBeGreaterThanOrEqual(ids[i - 1]!);
      }
    });
  }, 60_000);
});
