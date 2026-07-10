// Red spec for nexu-io/open-design#4137 (part 1) at the daemon HTTP boundary.
//
// When Claude Code writes a large page and the response is cut off at the
// model's output-length cap, the final assistant message carries
// `stop_reason: "max_tokens"`. Before the fix the daemon folded that into the
// generic clean-turn bucket: the run finished `succeeded` with no signal that
// the deliverable was left half-written, so the UI had nothing to show and no
// Continue affordance to offer.
//
// This exercises the real chat-run path: a fake `claude` streams a partial HTML
// artifact and ends the turn with `stop_reason: max_tokens`. The run must still
// be `succeeded` (we keep the partial file) but `GET /api/runs/:id` must now
// report `truncated: true` so the client can surface the cut-off + Continue.

import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  status: string;
  truncated?: boolean;
};

describe('truncated (max_tokens) run is surfaced (#4137 red spec)', () => {
  const originalEnv = {
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
  };
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
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('reports truncated: true on a succeeded run whose turn hit max_tokens', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-truncation-bin-'));
    const fakeClaude = await writeTruncatingClaude(binDir, 'claude-truncate');

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForRun(started.url);

    // The partial page is kept — a truncated turn is not a failure — but the
    // daemon must now flag that it was cut off so the UI can offer Continue.
    expect(run.status).toBe('succeeded');
    expect(run.truncated).toBe(true);
  });
});

async function writeTruncatingClaude(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(
    bin,
    `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('claude-code 1.0.0-truncate');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]');
  process.exit(0);
}
// Stream a partial HTML deliverable, then end the turn because the output-length
// cap was hit — exactly what Claude Code emits on a page that ran past budget.
console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-truncate-test' }));
console.log(JSON.stringify({
  type: 'assistant',
  message: {
    id: 'msg-truncated',
    content: [{ type: 'text', text: '<!doctype html>\\n<html><head><title>Big page' }],
    stop_reason: 'max_tokens',
  },
}));
setTimeout(() => process.exit(0), 20);
`,
    'utf8',
  );
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
  const projectId = `truncation_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Truncation repro',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = (await projectResponse.json()) as { conversationId: string };
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'truncation-test',
      'x-od-analytics-session-id': 'truncation-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId: `assistant_trunc_${randomUUID()}`,
      clientRequestId: `client_trunc_${randomUUID()}`,
      agentId: 'claude',
      message: 'build a large complex landing page',
      currentPrompt: 'build a large complex landing page',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = (await runResponse.json()) as { runId: string };
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(body.runId)}`);
    expect(response.status).toBe(200);
    const run = (await response.json()) as RunStatus;
    if (['failed', 'succeeded', 'canceled'].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${body.runId} did not finish`);
}
