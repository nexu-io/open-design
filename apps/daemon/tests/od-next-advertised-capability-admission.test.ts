// Native child forwarding is optional. A Claude build without the flag must
// execute OD Next without receiving an unsupported startup argument.
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

  it('runs active OD Next when Claude help omits optional child forwarding', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-next-advertised-caps-'));
    const fakeClaude = await writeUnadvertisedClaude(binDir, 'claude-unadvertised');

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
      odNextStrategyMode: 'active',
    });

    const run = await createAndWaitForRun(started.url);

    expect(run.strategyRolloutDecision?.effectiveMode).toBe('active');
    expect(run.strategyTask).toBeDefined();
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
if (process.argv.includes('--forward-subagent-text')) { console.error('unsupported child forwarding flag'); process.exit(2); }
const W = (o) => fs.writeSync(1, JSON.stringify(o) + '\\n');
W({ type: 'system', subtype: 'init', model: 'advertised-caps-test' });
W({ type: 'assistant', message: { id: 'm_done', content: [
  { type: 'text', text: 'Done.' },
], stop_reason: 'end_turn' } });
process.exit(0);
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
      message: 'build a prototype',
      currentPrompt: 'build a prototype',
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
