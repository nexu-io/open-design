import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { readMemoryConfig, writeMemoryConfig } from '../src/memory.js';
import { startServer } from '../src/server.js';

// Stable-prompt cache regression for the intent-signal hotfix
// (specs/current/intent-signal-cache-hotfix.md §1/§6). The three intent
// signals gate blocks inside daemonSystemPrompt, which is part of
// stableInstructionFingerprint — so a signal flip on a resume turn re-sends
// the whole stable block and records a `stable-prompt-changed` miss. The
// turn-1 discovery form's own option copy used to flip deck+platform at t2
// on EVERY form-driven conversation, making t2 a guaranteed miss.
//
// Uses the session-resuming fake OpenCode pattern from
// opencode-session-resume.test.ts: turn 2 resumes the captured session, so
// `promptCache` on the run reports the stable-slice cache decision.

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = { id: string; status: string; error: string | null };

type RunWithPromptCache = {
  id: string;
  promptCache?: { hit: boolean; missReason: string | null };
};

const SESSION = 'ses_intentsignal0001';

// Realistic turn-1 assistant output: the canonical discovery form from
// src/prompts/discovery.ts, whose option copy carries deck vocabulary
// ("Slide deck / pitch") the user never chose.
const DISCOVERY_FORM_ASSISTANT_TURN = [
  'Got it — quick brief to lock the direction:',
  '',
  '<question-form id="discovery" title="Quick brief — 30 seconds">',
  '{',
  '  "lang": "en",',
  '  "questions": [',
  '    { "id": "output", "label": "What are we making?", "type": "radio", "required": true,',
  '      "options": ["Slide deck / pitch", "Single web prototype / landing", "Multi-screen app prototype", "Dashboard / tool UI", "Editorial / marketing page"] },',
  '    { "id": "audience", "label": "Who is this for?", "type": "text" },',
  '    { "id": "scale", "label": "Roughly how much?", "type": "text" }',
  '  ]',
  '}',
  '</question-form>',
].join('\n');

const TURN1_BRIEF = 'set up a new internal metrics workspace';

function packedFormAnswerTurn2(outputAnswer: string): {
  message: string;
  currentPrompt: string;
} {
  const answers = [
    '[form answers — discovery]',
    `- What are we making?: ${outputAnswer}`,
    '- Who is this for?: internal exec review',
    '- Roughly how much?: 3 screens',
  ].join('\n');
  const message = [
    `## user\n${TURN1_BRIEF}`,
    `## assistant\n${DISCOVERY_FORM_ASSISTANT_TURN}`,
    `## user\n${answers}`,
  ].join('\n\n');
  return { message, currentPrompt: answers };
}

describe('intent signals × stable prompt cache', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;
  let originalMemoryConfig: Awaited<ReturnType<typeof readMemoryConfig>> | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await rm(binDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    binDir = null;
    if (process.env.OD_DATA_DIR && originalMemoryConfig) {
      await writeMemoryConfig(process.env.OD_DATA_DIR, {
        enabled: originalMemoryConfig.enabled,
        extraction: originalMemoryConfig.extraction ?? null,
      });
      originalMemoryConfig = null;
    }
    restoreEnv(originalEnv);
  });

  async function bootServer(): Promise<{ url: string }> {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-intent-cache-bin-'));
    const bin = await writeResumingOpencode(binDir);
    clearTelemetryEnv();
    // Memory auto-extraction folds prior form answers into the stable-region
    // "Personal memory" block, which legitimately changes the stable hash —
    // disable it so the assertions isolate the intent-signal contribution.
    if (process.env.OD_DATA_DIR) {
      originalMemoryConfig = await readMemoryConfig(process.env.OD_DATA_DIR);
      await writeMemoryConfig(process.env.OD_DATA_DIR, { enabled: false, extraction: null });
    }
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'opencode',
      agentCliEnv: { opencode: { OPENCODE_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });
    return { url: started.url };
  }

  it('a form-driven t2 with a non-deck answer is a stable-prompt cache HIT', async () => {
    const { url } = await bootServer();
    const { projectId, conversationId } = await createFreeformProject(url);

    const turn1 = await sendRunAndWait(url, projectId, conversationId, {
      message: `## user\n${TURN1_BRIEF}`,
      currentPrompt: TURN1_BRIEF,
    });
    expect(turn1.status).toBe('succeeded');

    // t2: the assistant turn carries the discovery form's full option copy
    // ("Slide deck / pitch"); the user answered "Dashboard / tool UI".
    // Option copy offered ≠ intent — no signal may flip, so the resumed
    // stable slice must be byte-identical and the turn must be a cache hit.
    const turn2 = await sendRunAndWait(
      url,
      projectId,
      conversationId,
      packedFormAnswerTurn2('Dashboard / tool UI'),
    );
    expect(turn2.status).toBe('succeeded');

    const promptCache = await runPromptCache(url, conversationId, turn2.id);
    expect(promptCache).toMatchObject({ hit: true });
  });

  it('a genuine deck answer costs exactly one miss, then latches back to hits', async () => {
    const { url } = await bootServer();
    const { projectId, conversationId } = await createFreeformProject(url);

    const turn1 = await sendRunAndWait(url, projectId, conversationId, {
      message: `## user\n${TURN1_BRIEF}`,
      currentPrompt: TURN1_BRIEF,
    });
    expect(turn1.status).toBe('succeeded');

    // t2 selects "Slide deck / pitch": new content genuinely enters the
    // stable region — the one justified miss.
    const turn2 = await sendRunAndWait(
      url,
      projectId,
      conversationId,
      packedFormAnswerTurn2('Slide deck / pitch'),
    );
    expect(turn2.status).toBe('succeeded');
    expect(await runPromptCache(url, conversationId, turn2.id)).toMatchObject({
      hit: false,
      missReason: 'stable-prompt-changed',
    });

    // t3 has no deck vocabulary of its own; the conversation latch must hold
    // the signal ON so the stable slice stays identical → cache hit again.
    const followUp = 'make the header a bit bolder';
    const turn3 = await sendRunAndWait(url, projectId, conversationId, {
      message: `## user\n${followUp}`,
      currentPrompt: followUp,
    });
    expect(turn3.status).toBe('succeeded');
    expect(await runPromptCache(url, conversationId, turn3.id)).toMatchObject({ hit: true });
  });
});

// Fake opencode CLI: stamps a fixed session id on every stream event so the
// daemon captures it on turn 1 and resumes with `-s` on later turns.
async function writeResumingOpencode(dir: string): Promise<string> {
  const bin = path.join(dir, 'opencode');
  await writeFile(
    bin,
    `#!/usr/bin/env node
const SESSION = ${JSON.stringify(SESSION)};
const argv = process.argv.slice(2);
if (argv.includes('--version')) { console.log('1.17.7'); process.exit(0); }
if (argv.includes('--help')) { console.log('opencode run [message..]'); process.exit(0); }
if (argv[0] === 'models') { console.log('anthropic/claude-sonnet-4-5'); process.exit(0); }
let done = false;
function finish() {
  if (done) return; done = true;
  const text = argv.includes('-s') ? 'Resumed reply.' : 'Created reply.';
  console.log(JSON.stringify({ type: 'step_start', sessionID: SESSION, part: { type: 'step-start' } }));
  console.log(JSON.stringify({ type: 'text', sessionID: SESSION, part: { type: 'text', text } }));
  console.log(JSON.stringify({ type: 'step_finish', sessionID: SESSION, part: { type: 'step-finish', tokens: { input: 11, output: 7, reasoning: 0, cache: { read: 5, write: 2 } }, cost: 0 } }));
  setTimeout(() => process.exit(0), 10);
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', () => {});
process.stdin.on('end', finish);
process.stdin.on('error', finish);
setTimeout(finish, 1500);
`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}

// A freeform project (no metadata kind): the maybe-deck framework gate only
// applies to freeform projects, which is where the flip lived.
async function createFreeformProject(
  url: string,
): Promise<{ projectId: string; conversationId: string }> {
  const projectId = `intent_cache_${randomUUID()}`;
  const response = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: projectId, name: 'Intent-signal cache fixture' }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { conversationId: string };
  return { projectId, conversationId: body.conversationId };
}

async function sendRunAndWait(
  url: string,
  projectId: string,
  conversationId: string,
  turn: { message: string; currentPrompt: string },
): Promise<RunStatus> {
  const response = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId: `assistant_${randomUUID()}`,
      clientRequestId: `client_${randomUUID()}`,
      agentId: 'opencode',
      message: turn.message,
      currentPrompt: turn.currentPrompt,
    }),
  });
  expect(response.status).toBe(202);
  const body = (await response.json()) as { runId: string };
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const statusResponse = await fetch(`${url}/api/runs/${encodeURIComponent(body.runId)}`);
    expect(statusResponse.status).toBe(200);
    const run = (await statusResponse.json()) as RunStatus;
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${body.runId} did not finish`);
}

async function runPromptCache(
  url: string,
  conversationId: string,
  runId: string,
): Promise<{ hit: boolean; missReason: string | null } | undefined> {
  const response = await fetch(
    `${url}/api/runs?conversationId=${encodeURIComponent(conversationId)}`,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { runs: RunWithPromptCache[] };
  return body.runs.find((run) => run.id === runId)?.promptCache;
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
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
