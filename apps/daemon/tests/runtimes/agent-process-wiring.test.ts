// The chat-run launcher in server.ts really uses the agent-process spawn path.
//
// The agent-process specs prove the helpers; this one proves the wiring: a run
// started through the production HTTP API for cursor-agent (the 2026-09-14
// incident runtime, a plain-text stdin reader) gets its composed prompt as a
// complete file-backed stdin and leaves a durable process record exactly while
// it runs. The agent is a fake script.
import fs from 'node:fs';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../../src/server.js';
import { agentProcessRecordPath } from '../../src/runtimes/agent-process.js';

type StartedServer = { url: string; server: Server; shutdown?: () => Promise<void> | void };
type StdinReport = { pid: number; stdinIsFile: boolean; bytes: number; hasSentinel: boolean };

async function waitFor<T>(
  probe: () => T | null | undefined | false | Promise<T | null | undefined | false>,
  timeoutMs: number,
  what: string,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() >= deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function fakeCursorAgent(reportPath: string, releasePath: string, sentinel: string): string {
  return `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2026.09.14-fake'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: cursor-agent --print --output-format stream-json'); process.exit(0); }
if (args[0] === 'status') { console.log('Logged in'); process.exit(0); }
if (args[0] === 'models') { console.log('auto - Auto'); process.exit(0); }
const stdinIsFile = fs.fstatSync(0).isFile();
const body = fs.readFileSync(0);
fs.writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify({
  pid: process.pid, stdinIsFile, bytes: body.length, hasSentinel: body.includes(${JSON.stringify(sentinel)}),
}));
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
const finish = () => {
  emit({ type: 'system', subtype: 'init', model: 'fake-cursor' });
  emit({ type: 'assistant', timestamp_ms: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } });
  emit({ type: 'result', duration_ms: 1, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } });
  process.exit(0);
};
const deadline = Date.now() + 20000;
const poll = setInterval(() => {
  if (fs.existsSync(${JSON.stringify(releasePath)}) || Date.now() > deadline) { clearInterval(poll); finish(); }
}, 50);
`;
}

describe.skipIf(process.platform === 'win32')('chat-run launcher uses the agent-process spawn path', () => {
  let started: StartedServer | null = null;
  let binDir: string | null = null;

  afterEach(async () => {
    const t0 = Date.now();
    await Promise.resolve(started?.shutdown?.());
    const t1 = Date.now();
    if (started?.server) {
      started.server.closeAllConnections?.();
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    console.log(`[agent-process-wiring] teardown shutdown=${t1 - t0}ms close=${Date.now() - t1}ms`);
    started = null;
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
  }, 30_000);

  it('delivers the complete composed prompt as a file-backed stdin and records the agent while it runs', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-agent-process-wiring-'));
    const reportPath = path.join(binDir, 'stdin-report.json');
    const releasePath = path.join(binDir, 'release');
    const sentinel = `LATEST-REQUEST-SENTINEL-${randomUUID()}`;
    const bin = path.join(binDir, 'cursor-agent');
    await writeFile(bin, fakeCursorAgent(reportPath, releasePath, sentinel), 'utf8');
    await chmod(bin, 0o755);

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    const url = started.url;
    const config = await fetch(`${url}/api/app-config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'cursor-agent',
        agentCliEnv: { 'cursor-agent': { CURSOR_AGENT_BIN: bin } },
        onboardingCompleted: true,
      }),
    });
    expect(config.status).toBe(200);
    await config.arrayBuffer();

    const projectId = `agent_process_wiring_${randomUUID()}`;
    const project = await fetch(`${url}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'agent process wiring',
        skipDiscoveryBrief: true,
        metadata: { kind: 'prototype' },
      }),
    });
    expect(project.status).toBe(200);
    const { conversationId } = (await project.json()) as { conversationId: string };

    // Bigger than the 64 KiB pipe buffer, with the latest request LAST.
    const filler = Array.from({ length: 2_000 }, (_, index) => `context line ${index}: earlier discussion`).join('\n');
    const message = `${filler}\n${sentinel}`;
    const response = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        conversationId,
        userMessageId: `user_${randomUUID()}`,
        assistantMessageId: `assistant_${randomUUID()}`,
        clientRequestId: `client_${randomUUID()}`,
        agentId: 'cursor-agent',
        message,
        currentPrompt: message,
      }),
    });
    expect(response.status).toBe(202);
    const { runId } = (await response.json()) as { runId: string };
    const runDir = path.join(process.env.OD_DATA_DIR!, 'runs', runId);

    const report = await waitFor(() => readJson<StdinReport>(reportPath), 30_000, 'the fake agent to read its stdin');
    expect(report.stdinIsFile, 'plain-text prompt handed over as a file-backed stdin').toBe(true);
    expect(report.hasSentinel, `agent read ${report.bytes} bytes without the latest request`).toBe(true);
    expect(report.bytes).toBeGreaterThan(64 * 1024);
    // On record for the next daemon start while it runs.
    expect(fs.existsSync(agentProcessRecordPath(runDir, report.pid))).toBe(true);
    // The staged prompt is gone as soon as the child owns it.
    expect(fs.readdirSync(runDir).filter((name) => name.endsWith('.prompt'))).toEqual([]);

    fs.writeFileSync(releasePath, '1');
    await waitFor(async () => {
      const run = await (await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`)).json() as { status: string };
      return ['succeeded', 'failed', 'canceled'].includes(run.status) ? run : null;
    }, 30_000, 'the run to finish');
    await waitFor(
      () => !fs.existsSync(agentProcessRecordPath(runDir, report.pid)),
      5_000,
      'the process record to be released once the agent group is gone',
    );
  }, 90_000);
});
