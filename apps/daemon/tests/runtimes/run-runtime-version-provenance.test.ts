import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { access, chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const promptFileInterleave = vi.hoisted(() => ({
  afterPrepare: null as null | (() => Promise<void>),
  onCleanup: null as null | (() => void),
}));

vi.mock('../../src/runtimes/prompt-file.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtimes/prompt-file.js')>();
  return {
    ...actual,
    preparePromptFileForAgent: async (
      ...args: Parameters<typeof actual.preparePromptFileForAgent>
    ) => {
      const prepared = await actual.preparePromptFileForAgent(...args);
      await promptFileInterleave.afterPrepare?.();
      if (!promptFileInterleave.onCleanup) return prepared;
      return {
        path: prepared?.path ?? '',
        cleanup: async () => {
          try {
            await prepared?.cleanup();
          } finally {
            promptFileInterleave.onCleanup?.();
          }
        },
      };
    },
  };
});

import { startServer } from '../../src/server.js';
import {
  forgetUnusableExecutables,
  rememberUnusableExecutable,
} from '../../src/runtimes/executables.js';
import { resolveAgentLaunch } from '../../src/runtimes/launch.js';
import { getAgentDef } from '../../src/runtimes/registry.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  status: string;
  error?: string | null;
  errorCode?: string | null;
  executionDiagnostics?: {
    environment?: {
      agentCliVersion?: {
        state: string;
        value?: string;
      };
    };
  };
};

describe('run runtime version provenance', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    while (tempDirs.length > 0) {
      await rm(tempDirs.pop() as string, { recursive: true, force: true });
    }
    promptFileInterleave.afterPrepare = null;
    promptFileInterleave.onCleanup = null;
    forgetUnusableExecutables('opencode');
    vi.restoreAllMocks();
    restoreEnv(originalEnv);
  });

  it('freezes a non-Codex CLI version into terminal execution diagnostics', async () => {
    const binDir = await createTempDir(tempDirs, 'od-run-version-bin-');
    const fakeOpenCode = await writeSuccessfulOpenCode(binDir);

    disableTelemetry();
    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'opencode',
      agentCliEnv: { opencode: { OPENCODE_BIN: fakeOpenCode } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createProject(started.url);
    const run = await createAndWaitForRun(started.url, projectId, conversationId);

    expect(run.status, JSON.stringify(run)).toBe('succeeded');
    expect(run.executionDiagnostics?.environment?.agentCliVersion).toEqual({
      state: 'available',
      value: 'opencode-cli 9.8.7',
      evidence: 'computed',
      source: 'agent-runtime',
      complete: true,
      definition: 'runtime CLI version observed during preflight',
    });
  });

  it('keeps provenance bound to the launch captured before executable fallback changes', async () => {
    const candidateADir = await createTempDir(tempDirs, 'od-run-version-a-');
    const candidateBDir = await createTempDir(tempDirs, 'od-run-version-b-');
    const candidateAMarker = path.join(candidateADir, 'run.marker');
    const candidateBMarker = path.join(candidateBDir, 'run.marker');
    const candidateA = await writeOpenCodeFixture(candidateADir, {
      binName: 'opencode-cli',
      version: 'opencode-cli candidate-a',
      runMarker: candidateAMarker,
    });
    const candidateB = await writeOpenCodeFixture(candidateBDir, {
      binName: 'opencode-cli',
      version: 'opencode-cli candidate-b',
      runMarker: candidateBMarker,
    });
    process.env.PATH = [candidateADir, candidateBDir, originalEnv.PATH ?? '']
      .filter(Boolean)
      .join(path.delimiter);
    process.env.OD_AGENT_HOME = candidateADir;
    delete process.env.OPENCODE_BIN;

    disableTelemetry();
    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'opencode',
      agentCliEnv: { opencode: {} },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const gate = createGate();
    promptFileInterleave.afterPrepare = gate.wait;
    const { projectId, conversationId } = await createProject(started.url);
    const runId = await createRun(started.url, projectId, conversationId);
    await gate.entered;

    const def = getAgentDef('opencode');
    expect(def).toBeTruthy();
    const launchBeforeFallback = resolveAgentLaunch(def!, {});
    expect(samePath(launchBeforeFallback.selectedPath, candidateA)).toBe(true);

    // Full agent detection publishes this same state when candidate A fails
    // while the run is between launch capture and its version preflight.
    rememberUnusableExecutable('opencode', launchBeforeFallback.selectedPath!);
    expect(samePath(resolveAgentLaunch(def!, {}).selectedPath, candidateB)).toBe(true);
    gate.release();

    const run = await waitForRun(started.url, runId);
    expect(run.status, JSON.stringify(run)).toBe('succeeded');
    expect(await pathExists(candidateAMarker)).toBe(true);
    expect(await pathExists(candidateBMarker)).toBe(false);
    expect(run.executionDiagnostics?.environment?.agentCliVersion?.value).toBe(
      'opencode-cli candidate-a',
    );
  });

  it('does not mutate or build a canceled run after a delayed version probe', async () => {
    const binDir = await createTempDir(tempDirs, 'od-run-version-cancel-');
    const probeStarted = path.join(binDir, 'probe-started.marker');
    const probeRelease = path.join(binDir, 'probe-release.marker');
    const probeFinished = path.join(binDir, 'probe-finished.marker');
    const runMarker = path.join(binDir, 'run.marker');
    const fakeOpenCode = await writeOpenCodeFixture(binDir, {
      binName: 'opencode-delayed',
      version: 'opencode-cli delayed',
      runMarker,
      versionGate: {
        started: probeStarted,
        release: probeRelease,
        finished: probeFinished,
      },
    });

    disableTelemetry();
    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'opencode',
      agentCliEnv: { opencode: { OPENCODE_BIN: fakeOpenCode } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const def = getAgentDef('opencode');
    expect(def).toBeTruthy();
    const buildArgs = vi.spyOn(def!, 'buildArgs');
    const cleanupReached = deferred();
    promptFileInterleave.onCleanup = cleanupReached.resolve;

    const { projectId, conversationId } = await createProject(started.url);
    const runId = await createRun(started.url, projectId, conversationId);
    await waitForFile(probeStarted);

    const cancelResponse = await fetch(
      `${started.url}/api/runs/${encodeURIComponent(runId)}/cancel`,
      { method: 'POST' },
    );
    expect(cancelResponse.status).toBe(200);
    await writeFile(probeRelease, 'release', 'utf8');
    await waitForFile(probeFinished);
    await cleanupReached.promise;

    const run = await waitForRun(started.url, runId);
    expect(run.status).toBe('canceled');
    expect(run.executionDiagnostics?.environment?.agentCliVersion?.state).toBe('not_collected');
    expect(buildArgs).not.toHaveBeenCalled();
    expect(await pathExists(runMarker)).toBe(false);
  });
});

function snapshotEnv(): Record<string, string | undefined> {
  return {
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    PATH: process.env.PATH,
    OD_AGENT_HOME: process.env.OD_AGENT_HOME,
    OPENCODE_BIN: process.env.OPENCODE_BIN,
  };
}

function restoreEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function disableTelemetry(): void {
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_BASE_URL;
  delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
  delete process.env.POSTHOG_KEY;
  delete process.env.POSTHOG_HOST;
}

async function writeSuccessfulOpenCode(dir: string): Promise<string> {
  return writeOpenCodeFixture(dir, {
    binName: 'opencode-version',
    version: 'opencode-cli 9.8.7',
  });
}

type OpenCodeFixtureOptions = {
  binName: string;
  version: string;
  runMarker?: string;
  versionGate?: {
    started: string;
    release: string;
    finished: string;
  };
};

async function writeOpenCodeFixture(
  dir: string,
  options: OpenCodeFixtureOptions,
): Promise<string> {
  const script = path.join(dir, `${options.binName}.cjs`);
  const source = [
    "const fs = require('node:fs');",
    `const version = ${JSON.stringify(options.version)};`,
    `const runMarker = ${JSON.stringify(options.runMarker ?? null)};`,
    `const versionGate = ${JSON.stringify(options.versionGate ?? null)};`,
    'const args = process.argv.slice(2);',
    'const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));',
    'async function main() {',
    "  if (args.includes('--version')) {",
    '    if (versionGate) {',
    "      fs.writeFileSync(versionGate.started, 'started');",
    '      while (!fs.existsSync(versionGate.release)) await sleep(20);',
    "      fs.writeFileSync(versionGate.finished, 'finished');",
    '    }',
    '    console.log(version);',
    '    return;',
    '  }',
    "  if (args.includes('--help')) {",
    "    console.log('Usage: opencode');",
    '    return;',
    '  }',
    "  if (args[0] === 'models') {",
    "    console.log('test/provider');",
    '    return;',
    '  }',
    "  if (runMarker) fs.writeFileSync(runMarker, 'ran');",
    "  console.log('{\"type\":\"step_start\"}');",
    "  console.log('{\"type\":\"text\",\"part\":{\"text\":\"completed\"}}');",
    "  console.log('{\"type\":\"step_finish\",\"part\":{\"tokens\":{\"input\":1,\"output\":1}}}');",
    '}',
    'main().catch((error) => {',
    '  console.error(error);',
    '  process.exitCode = 1;',
    '});',
    '',
  ].join('\n');
  await writeFile(script, source, 'utf8');

  const windows = process.platform === 'win32';
  const bin = path.join(dir, windows ? `${options.binName}.cmd` : options.binName);
  const launcher = windows
    ? `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`
    : `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(script)} "$@"\n`;
  await writeFile(bin, launcher, 'utf8');
  if (!windows) await chmod(bin, 0o755);
  return bin;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function createTempDir(dirs: string[], prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createGate(): {
  entered: Promise<void>;
  wait: () => Promise<void>;
  release: () => void;
} {
  const entered = deferred();
  const released = deferred();
  return {
    entered: entered.promise,
    wait: async () => {
      entered.resolve();
      await released.promise;
    },
    release: released.resolve,
  };
}

function samePath(left: string | null, right: string): boolean {
  if (!left) return false;
  const normalize = (value: string) => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitForFile(filePath: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    if (await pathExists(filePath)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`file did not appear: ${filePath}`);
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function createProject(url: string): Promise<{
  projectId: string;
  conversationId: string;
}> {
  const projectId = `run_version_${randomUUID()}`;
  const response = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Run version provenance',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(response.status).toBe(200);
  const body = await response.json() as { conversationId: string };
  return { projectId, conversationId: body.conversationId };
}

async function createAndWaitForRun(
  url: string,
  projectId: string,
  conversationId: string,
): Promise<RunStatus> {
  const runId = await createRun(url, projectId, conversationId);
  return waitForRun(url, runId);
}

async function createRun(
  url: string,
  projectId: string,
  conversationId: string,
): Promise<string> {
  const response = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId: `assistant_run_version_${randomUUID()}`,
      clientRequestId: `client_run_version_${randomUUID()}`,
      agentId: 'opencode',
      message: 'complete the task',
      currentPrompt: 'complete the task',
    }),
  });
  expect(response.status).toBe(202);
  const body = await response.json() as { runId: string };
  return body.runId;
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${runId} did not finish`);
}
