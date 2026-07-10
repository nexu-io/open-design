// Red spec for nexu-io/open-design#4137 (part 2).
//
// Symptom: "after switching to a new conversation, the previous design rules
// were lost." Project-level custom instructions ARE persisted on the project
// row (POST/PATCH /api/projects accept `customInstructions`) and the system
// prompt composer already renders a "## Custom instructions (project-level)"
// block for them — but the daemon's compose call never passed the field, so
// every conversation (first and subsequent) silently dropped the rules.
//
// This exercises the real chat-run path: a project is created WITH custom
// instructions, then a run starts against a fake `claude` that captures the
// prompt the daemon streams to it. The project rules must appear in that
// prompt. Before the fix they are absent; after wiring `project.customInstructions
// -> projectInstructions` they are present on every new conversation.

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

const PROJECT_RULE = 'Always use a bright lime accent and generous rounded corners on every element';

describe('project custom instructions persist into every conversation (#4137 red spec)', () => {
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
  let promptFile: string | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
    promptFile = null;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('injects project-level custom instructions into a fresh conversation prompt', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-project-rules-bin-'));
    promptFile = path.join(binDir, 'captured-prompt.txt');
    const fakeClaude = await writePromptCapturingClaude(binDir, 'claude-rules', promptFile);

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

    // A project carrying persistent design rules, and a brand-new conversation.
    const projectId = `rules_${randomUUID()}`;
    const projectResponse = await fetch(`${started.url}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Project rules repro',
        metadata: { kind: 'prototype' },
        customInstructions: PROJECT_RULE,
        skipDiscoveryBrief: true,
      }),
    });
    expect(projectResponse.status).toBe(200);
    const projectBody = (await projectResponse.json()) as { conversationId: string };

    await runAndWait(started.url, projectId, projectBody.conversationId);

    const captured = await readFile(promptFile, 'utf8');
    // The persisted project rule must reach the agent on this new conversation.
    expect(captured).toContain(PROJECT_RULE);
    expect(captured).toContain('Custom instructions (project-level)');
  });
});

async function writePromptCapturingClaude(
  dir: string,
  name: string,
  outFile: string,
): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(
    bin,
    `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) {
  console.log('claude-code 1.0.0-rules');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]');
  process.exit(0);
}
let buf = '';
process.stdin.on('data', (chunk) => { buf += chunk.toString('utf8'); });
const dump = () => {
  try { fs.writeFileSync(${JSON.stringify(outFile)}, buf); } catch {}
};
process.stdin.on('end', () => { dump(); process.exit(0); });
// Emit a clean turn so the run succeeds; the daemon writes the prompt to our
// stdin around spawn and closes it once it sees this clean turn_end.
console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-rules-test' }));
console.log(JSON.stringify({
  type: 'assistant',
  message: { id: 'msg-rules', content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' },
}));
// Fallback: if stdin end never arrives, dump what we have and exit.
setTimeout(() => { dump(); process.exit(0); }, 2000);
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

async function runAndWait(url: string, projectId: string, conversationId: string): Promise<void> {
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'project-rules-test',
      'x-od-analytics-session-id': 'project-rules-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId: `assistant_rules_${randomUUID()}`,
      clientRequestId: `client_rules_${randomUUID()}`,
      agentId: 'claude',
      message: 'build the landing page',
      currentPrompt: 'build the landing page',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = (await runResponse.json()) as { runId: string };
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(body.runId)}`);
    expect(response.status).toBe(200);
    const run = (await response.json()) as { status: string };
    if (['failed', 'succeeded', 'canceled'].includes(run.status)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${body.runId} did not finish`);
}
