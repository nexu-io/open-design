// Regression: OD Next admission must verify what the *installed* CLI
// advertises, not only what the bundled fixture registry says the runtime
// *path* is capable of.
//
// `claude.buildArgs` refuses to launch an admitted OD Next Run whose CLI does
// not advertise `--forward-subagent-text`. Admission used to derive
// `runtimeCapabilityVerified` purely from the bundled capability fixture plus a
// `--version` probe, so a Claude build without that flag was still admitted and
// the user's Run then died at spawn with AGENT_EXECUTION_FAILED.
//
// The symptom hid on developer machines: a real Claude Code install had already
// populated `agentCapabilities` through full detection, so the cached map
// answered "advertised" for a fake CLI that never advertised anything. On a
// host with no Claude Code (CI) the map was empty and every OD Next-eligible
// design run failed.
//
// Correct behaviour: an installed CLI that does not advertise the flags OD Next
// will demand loses admission and takes the ordinary route, and the Run
// succeeds.
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

  it('does not admit a Claude build whose help omits --forward-subagent-text', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-next-advertised-caps-'));
    const fakeClaude = await writeUnadvertisedClaude(binDir, 'claude-unadvertised');

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForRun(started.url);

    // Admission, not spawn, is where the gap is enforced.
    expect(run.strategyRolloutDecision?.effectiveMode).not.toBe('active');
    expect(run.strategyRolloutDecision?.reasonCodes ?? []).toContain(
      'od_next_rollout_capability_advertised_capability_missing',
    );
    expect(run.strategyTask).toBeUndefined();
    // The ordinary route still runs the turn end to end.
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
