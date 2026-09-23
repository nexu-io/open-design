import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// Wiring coverage for the ACP handshake-rejection classification, driven
// through the FULL server run cycle rather than the pure helpers in isolation.
//
// The failure this pins down (Kimi Code 0.37.x / 0.38.0): the agent CLI answers
// `initialize`, then rejects `session/new` with a bare JSON-RPC `Internal
// error`. `attachAcpSession` turns that into `fail('json-rpc id 2: Internal
// error')`, whose payload the ACP `send` bridge in server.ts forwards to the
// SSE client verbatim; the close handler then short-circuits on
// `acpFatalErrorObservedBeforeCancellation && hasFatalError()`, well before the
// stderr-tail `rewriteKnownAgentStreamError` fallback further down.
//
// So a unit test over the pure predicates proves nothing about what the user
// reads. These tests assert on the two surfaces a user and the telemetry
// pipeline actually observe — the `error` SSE event recorded in the run's
// events log, and `run.error` / `run.errorCode` on `GET /api/runs/:id` — plus
// the spawn count, which is what "stop retrying a deterministic failure" means
// in practice.
//
// The daemon's job here is to NAME the failure, not to word it: it emits the
// `AGENT_CLI_SESSION_REFUSED` code plus the structured runtime identity (the
// agent's display name) and leaves `run.error` as the agent's own line.
// The sentence the user reads is the web's, resolved from that code through
// i18n — a daemon-authored English paragraph can never be localized.

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
};

/** The structured half of an SSE `error` frame — what the web localizes from. */
type ErrorFrame = {
  message?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
    retryable?: unknown;
    details?: Record<string, unknown>;
  };
};

type RunEvent = { event: string; data: unknown };

/** The persisted half of the same failure — what a reload reads instead of SSE. */
type PersistedStatusEvent = {
  kind?: unknown;
  label?: unknown;
  detail?: unknown;
  code?: unknown;
  failureCategory?: unknown;
  failureDetail?: unknown;
};

type PersistedMessage = {
  id: string;
  role: string;
  events?: PersistedStatusEvent[];
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_ACP_CLI = path.join(HERE, 'fixtures', 'fake-acp-handshake-cli.mjs');

/** The agent the reported users were actually running when this broke. */
const AGENT_ID = 'kimi';
const AGENT_BIN = 'kimi';
/** `kimiAgentDef.name` — the display name the guidance copy must lead with. */
const AGENT_DISPLAY_NAME = 'Kimi CLI';
/**
 * What an ACP CLI says when a runtime IT manages failed to come up, verbatim
 * from vela's `acp_runtime.go` (`start opencode server: %v` wrapping
 * `opencode exited before readiness: %w`). Reported from inside `session/new`,
 * so it reaches the daemon handshake-numbered — while saying nothing at all
 * about the agent CLI's own build.
 */
const RUNTIME_NEVER_READY =
  'start opencode server: opencode exited before readiness: exit status 3';

describe('ACP handshake rejection — server wiring', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;
  // The empty home detection is scoped to for this test — see
  // `isolateAgentDetection`. Per test, because the toolchain-directory cache is
  // keyed on it.
  let agentHomeDir = '';

  beforeEach(async () => {
    agentHomeDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-handshake-home-'));
  });

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await removeTempDir(binDir);
    binDir = null;
    if (agentHomeDir) await removeTempDir(agentHomeDir);
    agentHomeDir = '';
    restoreEnv(originalEnv);
  });

  it('names the refusal with an error code and structured identity, leaving the agent line verbatim', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-handshake-bin-'));
    const logPath = path.join(binDir, 'invocations.jsonl');
    await writeAcpCliShim(binDir, AGENT_BIN, { logPath, cliVersion: '0.38.0' });
    isolateAgentDetection(binDir, agentHomeDir);

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, { agentId: AGENT_ID });
    // Detection records the `--version` probe result the guidance copy names.
    await detectAgents(started.url);

    const conversationId = await createConversation(started.url);
    const run = await sendRunAndWait(started.url, conversationId, 'draft a landing page');

    expect(run.status).toBe('failed');

    // 1. `run.error` is the agent's own line, unedited. It is the input to
    //    run-failure-classification.ts, so dropping or padding the JSON-RPC
    //    frame would degrade this failure class in telemetry — and it is the
    //    text the card shows under 「查看错误详情」, so it must appear once and
    //    carry no prose of the daemon's own.
    const runError = run.error ?? '';
    expect(runError).toBe('json-rpc id 2: Internal error');
    expect(runError).not.toMatch(/refused to start a session/i);
    expect(runError).not.toMatch(/update the cli/i);
    expect(runError).not.toMatch(/Details:/i);

    // 2. The failure is NAMED, not worded. A code is localizable; an English
    //    paragraph written in the daemon is not.
    expect(run.errorCode).toBe('AGENT_CLI_SESSION_REFUSED');

    // 3. The SSE `error` frame carries the same code plus the identity the
    //    localized copy interpolates. This is the payload the ACP bridge
    //    forwards to connected clients, and the one `run.error` is read from.
    const events = await readRunEvents(run.eventsLogPath);
    const errorEvents = events.filter((event) => event.event === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
    for (const event of errorEvents) {
      const frame = event.data as ErrorFrame;
      expect(frame.error?.code).toBe('AGENT_CLI_SESSION_REFUSED');
      expect(frame.error?.details).toMatchObject({
        kind: 'agent_cli',
        action: 'update_cli',
        agent: AGENT_DISPLAY_NAME,
      });
      // Named, not versioned: the runtime is identified so the copy can lead
      // with it, and no CLI build is reported. Reading the build THIS run
      // started with costs a pre-spawn `--version` probe on every launch, and
      // the localized sentence ("the installed version") is true without it.
      expect(frame.error?.details).not.toHaveProperty('agentCliVersion');
      // The message fields stay the agent's line on both surfaces.
      expect(effectiveErrorMessage(event.data)).toBe('json-rpc id 2: Internal error');
      expect(JSON.stringify(event.data)).not.toMatch(/refused to start a session/i);
    }
  });

  // The SSE frame is only half the surface. The daemon persists every run event
  // onto the assistant message BEFORE emitting it, and `ChatPane` rebuilds the
  // failure card from that stored event after a reload — it never replays the
  // stream. So a code that reaches the live client but not the database means
  // the localized card is shown while the tab stays open and collapses to the
  // generic failure copy the moment the user comes back, which is exactly when
  // they return to act on it.
  it('persists the failure code, so a reload still renders the same card', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-handshake-reload-bin-'));
    const logPath = path.join(binDir, 'invocations.jsonl');
    await writeAcpCliShim(binDir, AGENT_BIN, { logPath, cliVersion: '0.38.0' });
    isolateAgentDetection(binDir, agentHomeDir);

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, { agentId: AGENT_ID });
    await detectAgents(started.url);

    const conversationId = await createConversation(started.url);
    const run = await sendRunAndWait(started.url, conversationId, 'draft a landing page');
    expect(run.status).toBe('failed');
    expect(run.errorCode).toBe('AGENT_CLI_SESSION_REFUSED');

    // Read the conversation back the way a reloaded client does.
    const errorEvent = await readPersistedRunErrorEvent(started.url, conversationId);
    expect(errorEvent.code).toBe('AGENT_CLI_SESSION_REFUSED');
    // The agent's own line survives into storage too — same invariant as the
    // live surface, since this is the text the card shows under details.
    expect(errorEvent.detail).toBe('json-rpc id 2: Internal error');
    // The finalizer rewrites this same event in place to stamp the run's
    // classification. Asserting those landed proves the pass ran, and that it
    // enriched the stored event rather than replacing it with a fresh one.
    expect(errorEvent.failureCategory).toBe('process_exit');
    expect(errorEvent.failureDetail).toBe('agent_protocol_error');
  });

  it('does not re-run a handshake rejection — the same CLI build refuses again', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-handshake-retry-bin-'));
    const logPath = path.join(binDir, 'invocations.jsonl');
    // The CLI claims its own handshake rejection is transient. The daemon must
    // still refuse to retry: nothing streamed, and the identical request
    // against the identical build only reproduces the identical error.
    await writeAcpCliShim(binDir, AGENT_BIN, {
      logPath,
      cliVersion: '0.37.2',
      retryable: true,
    });
    isolateAgentDetection(binDir, agentHomeDir);

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, { agentId: AGENT_ID });
    await detectAgents(started.url);

    const conversationId = await createConversation(started.url);
    const run = await sendRunAndWait(started.url, conversationId, 'draft a landing page');

    expect(run.status).toBe('failed');
    expect(run.error ?? '').toBe('json-rpc id 2: Internal error');
    expect(run.errorCode).toBe('AGENT_CLI_SESSION_REFUSED');

    // This shape carries a nested `error` object (the agent supplied
    // `error.data`), which is the field `run.error` and `run.errorCode` are
    // read from — so the code has to land there, not only on the top level.
    // The agent's own `data` survives alongside the identity the card needs.
    const events = await readRunEvents(run.eventsLogPath);
    const errorEvents = events.filter((event) => event.event === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
    for (const event of errorEvents) {
      const frame = event.data as ErrorFrame;
      expect(frame.error?.code).toBe('AGENT_CLI_SESSION_REFUSED');
      expect(frame.error?.message).toBe('json-rpc id 2: Internal error');
      expect(frame.error?.details).toMatchObject({
        kind: 'agent_cli',
        action: 'update_cli',
        agent: AGENT_DISPLAY_NAME,
        retryable: true,
      });
      // A CLI that calls its own handshake rejection transient does not get to
      // mark the run retryable: the identical request against the identical
      // build only reproduces it.
      expect(frame.error?.retryable).toBe(false);
    }

    // The daemon opened exactly one session for this run. (Model detection
    // probes the same CLI over ACP, so count only sessions opened by
    // `attachAcpSession`, which identifies itself as `open-design`.)
    const runSessions = await readRunSessionRequests(logPath);
    expect(runSessions).toEqual(['session/new']);

    // …and recorded the decision rather than reaching the cap silently.
    expect(events.some((event) => event.event === 'run_retry_attempted')).toBe(false);
    const retryFinished = events.filter((event) => event.event === 'run_retry_finished');
    expect(retryFinished.length).toBeGreaterThan(0);
    for (const event of retryFinished) {
      expect(event.data as Record<string, unknown>).toMatchObject({
        retry_result: 'suppressed',
      });
    }
  });

  // Regression for the misfire this guidance shipped with: reading only the
  // JSON-RPC id made EVERY handshake-stage error a CLI-compatibility verdict.
  // Running a real Kimi CLI while signed out produces `json-rpc id 2:
  // Authentication required` — a healthy, current CLI reporting the one thing
  // it cannot do for the user — and the daemon answered it by telling them to
  // update or downgrade that CLI. No pure-function test caught it, because the
  // helpers were consistent with themselves; only the end-to-end text a signed
  // out user reads shows the prescription is wrong.
  it('does not blame the CLI version when the agent says the user is signed out', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-handshake-auth-bin-'));
    const logPath = path.join(binDir, 'invocations.jsonl');
    await writeAcpCliShim(binDir, AGENT_BIN, {
      logPath,
      cliVersion: '0.38.0',
      errorMessage: 'Authentication required',
    });
    isolateAgentDetection(binDir, agentHomeDir);

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, { agentId: AGENT_ID });
    await detectAgents(started.url);

    const conversationId = await createConversation(started.url);
    const run = await sendRunAndWait(started.url, conversationId, 'draft a landing page');

    expect(run.status).toBe('failed');

    const runError = run.error ?? '';
    // What the agent actually said survives — that is the sentence pointing at
    // the fix (sign in), and it is also what the classifier reads.
    expect(runError).toMatch(/json-rpc id 2: Authentication required/i);
    // …and the CLI-compatibility verdict is not pinned on it. Getting this
    // wrong now costs a whole localized card, not just a paragraph.
    expect(run.errorCode).not.toBe('AGENT_CLI_SESSION_REFUSED');

    const events = await readRunEvents(run.eventsLogPath);
    const errorEvents = events.filter((event) => event.event === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
    for (const event of errorEvents) {
      const frame = event.data as ErrorFrame;
      expect(frame.error?.code).not.toBe('AGENT_CLI_SESSION_REFUSED');
      expect(frame.error?.details?.kind).not.toBe('agent_cli');
    }
  });

  // Same misfire, a different cause: the predicate that decides "the CLI gave
  // no reason" recognised only the three agent-service classes, so every OTHER
  // cause the run classifier already knows how to advise on — prompt size
  // first among them — was rewritten into "your CLI version is incompatible".
  // The user whose content was too long was told to change a healthy CLI, while
  // the telemetry for the same run said `prompt_too_large` / `reduce_context`.
  it('does not blame the CLI version when the agent says the request was too large', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-handshake-size-bin-'));
    const logPath = path.join(binDir, 'invocations.jsonl');
    await writeAcpCliShim(binDir, AGENT_BIN, {
      logPath,
      cliVersion: '0.38.0',
      errorMessage: '[code=request_too_large] request body exceeds configured limit',
    });
    isolateAgentDetection(binDir, agentHomeDir);

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, { agentId: AGENT_ID });
    await detectAgents(started.url);

    const conversationId = await createConversation(started.url);
    const run = await sendRunAndWait(started.url, conversationId, 'draft a landing page');

    expect(run.status).toBe('failed');
    // Verbatim, as with every other named cause — this is the line that says
    // what to shorten, and the line the classifier reads.
    expect(run.error ?? '').toBe(
      'json-rpc id 2: [code=request_too_large] request body exceeds configured limit',
    );
    expect(run.errorCode).not.toBe('AGENT_CLI_SESSION_REFUSED');

    const events = await readRunEvents(run.eventsLogPath);
    const errorEvents = events.filter((event) => event.event === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
    for (const event of errorEvents) {
      const frame = event.data as ErrorFrame;
      expect(frame.error?.code).not.toBe('AGENT_CLI_SESSION_REFUSED');
      // The prescription the card would render must not be "update your CLI".
      expect(frame.error?.details?.action).not.toBe('update_cli');
      expect(frame.error?.details?.kind).not.toBe('agent_cli');
      expect(effectiveErrorMessage(event.data)).toBe(
        'json-rpc id 2: [code=request_too_large] request body exceeds configured limit',
      );
    }
  });

  // AMR is the largest population running this path, and what it runs
  // underneath is OpenCode. When vela's bundled OpenCode child fails to come up
  // — a port collision, an OOM kill, a half-written config — vela reports that
  // from inside `session/new`, so the failure arrives handshake-numbered even
  // though the agent CLI refused nothing at all.
  //
  // Two things then go wrong at once if the JSON-RPC id is the only evidence
  // consulted: the user is told to replace a CLI that is perfectly healthy,
  // and the automatic retry that actually recovers a startup race is withdrawn.
  // A startup race recovers on the second attempt; a CLI-build verdict never
  // does, which is why the two must not be collapsed.
  it('keeps a bundled runtime that never started retryable, and does not blame the CLI', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-handshake-startup-bin-'));
    const logPath = path.join(binDir, 'invocations.jsonl');
    await writeAcpCliShim(binDir, AGENT_BIN, {
      logPath,
      cliVersion: '0.38.0',
      errorMessage: RUNTIME_NEVER_READY,
      // vela marks its own startup failure transient. Unlike a handshake
      // refusal — where a CLI claiming retryability is claiming something the
      // daemon can disprove — here the CLI is right, and the daemon must not
      // overrule it.
      retryable: true,
    });
    isolateAgentDetection(binDir, agentHomeDir);

    clearTelemetryEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, { agentId: AGENT_ID });
    await detectAgents(started.url);

    const conversationId = await createConversation(started.url);
    const run = await sendRunAndWait(started.url, conversationId, 'draft a landing page');

    expect(run.status).toBe('failed');
    expect(run.error ?? '').toBe(`json-rpc id 2: ${RUNTIME_NEVER_READY}`);
    expect(run.errorCode).not.toBe('AGENT_CLI_SESSION_REFUSED');

    const events = await readRunEvents(run.eventsLogPath);
    const errorEvents = events.filter((event) => event.event === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
    for (const event of errorEvents) {
      const frame = event.data as ErrorFrame;
      expect(frame.error?.code).not.toBe('AGENT_CLI_SESSION_REFUSED');
      expect(frame.error?.details?.action).not.toBe('update_cli');
      expect(frame.error?.details?.kind).not.toBe('agent_cli');
      // The retryability the CLI reported survives to the client.
      expect(frame.error?.retryable).not.toBe(false);
      expect(effectiveErrorMessage(event.data)).toBe(`json-rpc id 2: ${RUNTIME_NEVER_READY}`);
    }

    // The retry the fatal path already granted this shape is still granted:
    // the daemon re-ran it rather than recording a suppression.
    expect(events.some((event) => event.event === 'run_retry_attempted')).toBe(true);
    expect(await readRunSessionRequests(logPath)).toEqual(['session/new', 'session/new']);

    // …and the telemetry files it as the fatal startup failure it is, not as a
    // session-init CLI verdict. A card and a dashboard disagreeing about the
    // remedy is how this class of bug stays invisible.
    const errorEvent = await readPersistedRunErrorEvent(started.url, conversationId);
    expect(errorEvent.code).not.toBe('AGENT_CLI_SESSION_REFUSED');
    expect(errorEvent.failureCategory).toBe('process_exit');
    expect(errorEvent.failureDetail).toBe('fatal_rpc_error');
  });

});

async function writeAcpCliShim(
  dir: string,
  name: string,
  opts: {
    logPath: string;
    cliVersion: string;
    retryable?: boolean;
    errorMessage?: string;
  },
): Promise<string> {
  const bin = path.join(dir, name);
  const lines = [
    '#!/bin/sh',
    `export FAKE_ACP_INVOCATION_LOG=${JSON.stringify(opts.logPath)}`,
    `export FAKE_ACP_CLI_VERSION=${JSON.stringify(opts.cliVersion)}`,
  ];
  if (opts.errorMessage) {
    lines.push(
      `export FAKE_ACP_SESSION_NEW_ERROR_MESSAGE=${JSON.stringify(opts.errorMessage)}`,
    );
  }
  if (opts.retryable) lines.push('export FAKE_ACP_SESSION_NEW_ERROR_RETRYABLE=1');
  lines.push(
    `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_ACP_CLI)} "$@"`,
    '',
  );
  await writeFile(bin, lines.join('\n'), 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

/** Warms the daemon-lifetime `--version` probe cache the failure copy reads. */
async function detectAgents(url: string): Promise<void> {
  const response = await fetch(`${url}/api/agents`);
  expect(response.status).toBe(200);
  await response.json();
}

/**
 * Makes the fixture CLI the ONLY agent CLI detection can find.
 *
 * `GET /api/agents` probes every shipped runtime, and detection resolves
 * binaries from `process.env.PATH` PLUS the machine's user toolchain
 * directories — Homebrew, `~/.local/bin`, `~/.bun/bin`, version-manager and npm
 * prefixes (`resolvePathDirs` in runtimes/executables.ts). So on any host that
 * actually has agent CLIs installed, one refresh becomes a dozen real
 * `--version` / `--help` / compatibility spawns, and the cost of a test that
 * waits on one is a property of the host rather than of the code under test.
 * Measured through this same path: ~2.8s on this machine, and the gated case
 * below — which waits on a refresh twice — ran ~28s on a reviewer's, past the
 * suite's 20s test timeout, while passing here.
 *
 * `OD_AGENT_HOME` is detection's own answer to that (`resolveDetectionHome`):
 * pointed at an empty directory it scopes the search strictly to that home and
 * skips the machine's toolchain locations entirely, so the walk over the
 * registry finds nothing except what this test wrote onto PATH. Same route,
 * same probe path, same assertions — the host's CLIs simply stop being dragged
 * through them, and the refresh drops to a single spawn of the fake CLI.
 *
 * @param dir - Directory holding the fake agent CLI shim.
 * @param homeDir - Empty directory to scope detection to, per test.
 */
function isolateAgentDetection(dir: string, homeDir: string): void {
  process.env.OD_AGENT_HOME = homeDir;
  // System bins stay reachable (the shim's `#!/bin/sh`, and anything the
  // daemon shells out to); no agent CLI lives there.
  process.env.PATH = [dir, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
}

/**
 * Handshake requests issued by `attachAcpSession` (client id `open-design`),
 * excluding the `open-design-detect` probes `detectAcpModels` makes against the
 * same CLI.
 */
async function readRunSessionRequests(logPath: string): Promise<string[]> {
  let raw = '';
  try {
    raw = await readFile(logPath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { method: string; client?: string })
    .filter((entry) => entry.client === 'open-design')
    .map((entry) => entry.method);
}

/** Mirrors `extractErrorDetails` in runtimes/runs.ts — the text that becomes `run.error`. */
function effectiveErrorMessage(data: unknown): string {
  const payload = (data ?? {}) as { message?: unknown; error?: unknown };
  const nested =
    payload.error && typeof payload.error === 'object'
      ? (payload.error as { message?: unknown })
      : null;
  if (typeof nested?.message === 'string' && nested.message.trim()) return nested.message;
  return typeof payload.message === 'string' ? payload.message : '';
}

/**
 * The stored `status: 'error'` event a reloaded conversation renders from.
 *
 * Goes through the same route the web client calls on mount, so this reads what
 * a user coming back to the tab actually gets — not what the live stream said.
 * Polls briefly because finalize-time enrichment lands just after the run turns
 * terminal; it does not tolerate a missing event.
 */
async function readPersistedRunErrorEvent(
  url: string,
  encoded: string,
): Promise<PersistedStatusEvent> {
  const { projectId, conversationId, headers } = decodeFixtureIdentity(encoded);
  const startedAt = Date.now();
  let last: PersistedStatusEvent | null = null;
  while (Date.now() - startedAt < 10_000) {
    const response = await fetch(
      `${url}/api/projects/${encodeURIComponent(projectId)}`
        + `/conversations/${encodeURIComponent(conversationId)}/messages`,
      { headers },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { messages?: PersistedMessage[] };
    for (const message of (body.messages ?? []).slice().reverse()) {
      if (message.role !== 'assistant') continue;
      const events = message.events ?? [];
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];
        if (event?.kind === 'status' && event.label === 'error') {
          last = event;
          // The finalizer rewrites this event a beat after the run turns
          // terminal, to stamp the run's classification. Wait for that pass so
          // the assertions read the settled row rather than the first write.
          if (typeof event.code === 'string' && typeof event.failureCategory === 'string') {
            return event;
          }
        }
      }
    }
    await delay(50);
  }
  if (last) return last;
  throw new Error('conversation never persisted a status:error event');
}

function decodeFixtureIdentity(encoded: string): {
  projectId: string;
  conversationId: string;
  headers: Record<string, string>;
} {
  const [projectId, conversationId, workspaceId, workspaceMemberId] = encoded.split('::');
  if (!projectId || !conversationId || !workspaceId || !workspaceMemberId) {
    throw new Error(`invalid ACP handshake fixture identity: ${encoded}`);
  }
  return {
    projectId,
    conversationId,
    headers: {
      'x-od-workspace-id': workspaceId,
      'x-od-workspace-type': 'personal',
      'x-od-workspace-member-id': workspaceMemberId,
      'x-od-workspace-role': 'owner',
    },
  };
}

async function readRunEvents(eventsLogPath: string): Promise<RunEvent[]> {
  let raw = '';
  try {
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

function snapshotEnv(): Record<string, string | undefined> {
  return {
    PATH: process.env.PATH,
    OD_AGENT_HOME: process.env.OD_AGENT_HOME,
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

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
      ...patch,
    }),
  });
  expect(response.status).toBe(200);
}

async function createConversation(url: string): Promise<string> {
  const projectId = `acp_handshake_${randomUUID().replace(/-/g, '')}`;
  const workspaceId = `acp_handshake_personal_${projectId}`;
  const workspaceMemberId = `acp_handshake_owner_${projectId}`;
  const workspaceHeaders = {
    'x-od-workspace-id': workspaceId,
    'x-od-workspace-type': 'personal',
    'x-od-workspace-member-id': workspaceMemberId,
    'x-od-workspace-role': 'owner',
  };
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...workspaceHeaders },
    body: JSON.stringify({
      id: projectId,
      name: 'ACP handshake smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = (await projectResponse.json()) as { conversationId: string };
  return [projectId, projectBody.conversationId, workspaceId, workspaceMemberId].join('::');
}

async function sendRunAndWait(
  url: string,
  encoded: string,
  message: string,
): Promise<RunStatus> {
  const { projectId, conversationId, headers: workspaceHeaders } =
    decodeFixtureIdentity(encoded);
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'acp-handshake-test',
      'x-od-analytics-session-id': 'acp-handshake-session',
      'x-od-analytics-client-type': 'web',
      ...workspaceHeaders,
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId: `assistant_acp_${randomUUID()}`,
      clientRequestId: `client_acp_${randomUUID()}`,
      agentId: AGENT_ID,
      message,
      currentPrompt: message,
    }),
  });
  const body = (await runResponse.json()) as { runId?: string };
  expect(runResponse.status, JSON.stringify(body)).toBe(202);
  expect(body.runId).toBeTypeOf('string');
  return await waitForRun(url, body.runId!, workspaceHeaders);
}

async function waitForRun(
  url: string,
  runId: string,
  headers: Record<string, string>,
): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`, { headers });
    expect(response.status).toBe(200);
    const run = (await response.json()) as RunStatus;
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await delay(100);
  }
  throw new Error(`run ${runId} did not finish`);
}

async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
