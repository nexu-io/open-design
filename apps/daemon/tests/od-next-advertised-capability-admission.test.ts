// Adaptive execution can complete serially without optional native-child flags.
// Keep admission and launch aligned: missing flags must not cause a fallback or
// a spawn failure. Frozen V2 capability requirements remain covered separately.
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { url: string; server: Server; shutdown?: () => Promise<void> | void };

type RunStatus = {
  status: string;
  error?: string | null;
  errorCode?: string | null;
  strategyTask?: unknown;
  strategyRolloutDecision?: {
    effectiveMode: string;
    reasonCodes: string[];
  } | null;
};

describe('OD Next admission vs advertised CLI capabilities', () => {
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
  });

  it('runs an adaptive task serially when Claude omits optional child flags', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-next-advertised-caps-'));
    const fakeClaude = await writeUnadvertisedClaude(binDir, 'claude-unadvertised');

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
      // Exercise active admission, not the installation's default opt-out.
      odNextStrategyMode: 'active',
    });

    const run = await createAndWaitForRun(started.url);

    expect(run.strategyRolloutDecision?.effectiveMode).toBe('active');
    expect(run.strategyTask, JSON.stringify(run.strategyTask)).toMatchObject({
      executionPolicy: 'adaptive_v1', inputStage: 'request', outcome: 'completed',
    });
    expect(run.error ?? null).toBeNull();
    expect(run.status).toBe('succeeded');
  });
});

async function writeUnadvertisedClaude(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('claude-code 2.1.233 (Claude Code)'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]'); process.exit(0); }
const W = (o) => fs.writeSync(1, JSON.stringify(o) + '\\n');
if (process.argv.includes('--forward-subagent-text') || process.argv.includes('--agents')) {
  throw new Error('Optional child flags must not be required for serial execution.');
}
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  if (!input.includes('\\n')) return;
  const user = JSON.parse(input.slice(0, input.indexOf('\\n')));
  const prompt = typeof user.message.content === 'string'
    ? user.message.content : user.message.content.map((block) => block.text || '').join('');
  if (!prompt.includes('open-design.strategy-state/adaptive-v1')) throw new Error('Expected adaptive instructions.');
  W({ type: 'system', subtype: 'init', model: 'advertised-caps-test',
    session_id: '019fffaa-0000-7000-8000-000000000077' });
  W({ type: 'assistant', message: { id: 'm_done', content: [
    { type: 'text', text: 'Plan: define the page, then implement it after approval.'
      + '\\n<open-design-runtime-state>\\n' + JSON.stringify({
        schema: 'open-design.strategy-state/adaptive-v1', outcome: 'completed', deliveryKind: 'plan',
      }) + '\\n</open-design-runtime-state>' },
  ], stop_reason: 'end_turn' } });
  process.exit(0);
});
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
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
  const projectId = `od_next_caps_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'OD Next advertised capability admission',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = await projectResponse.json() as { conversationId: string };
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId: `assistant_caps_${randomUUID()}`,
      clientRequestId: `client_caps_${randomUUID()}`,
      agentId: 'claude',
      message: 'Only plan a prototype. Do not create files yet.',
      currentPrompt: 'Only plan a prototype. Do not create files yet.',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = await runResponse.json() as { runId: string };
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(body.runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (['failed', 'succeeded', 'canceled'].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${body.runId} did not finish`);
}
