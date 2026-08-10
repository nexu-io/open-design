import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import {
  clearRememberedLiveModels,
  rememberLiveModels,
} from '../src/runtimes/models.js';

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
  exitCode?: number | null;
  failureCategory?: string | null;
  failureDetail?: string | null;
  failureAction?: string | null;
};

const CODEX_AUTH_OR_ENDPOINT_ENV_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE',
  'CODEX_API_KEY',
] as const;

const EXTERNAL_ENV_KEYS = [
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'LANGFUSE_BASE_URL',
  'OPEN_DESIGN_TELEMETRY_RELAY_URL',
  'POSTHOG_KEY',
  'POSTHOG_HOST',
  ...CODEX_AUTH_OR_ENDPOINT_ENV_KEYS,
] as const;

type EnvSnapshot = {
  keys: readonly string[];
  entries: Array<[string, string]>;
};

describe('Codex configured-model capability preflight', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let tempDir: string | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
    tempDir = null;
    clearRememberedLiveModels('codex');
    restoreEnv(originalEnv);
  });

  it('blocks an unsupported configured default model before spawning Codex exec', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'od-codex-model-preflight-'));
    const codexHome = path.join(tempDir, 'codex-home');
    const spawnMarker = path.join(tempDir, 'codex-exec-spawned');
    const fakeCodex = await writeFakeCodex(tempDir, spawnMarker);
    await mkdir(codexHome, { recursive: true });
    await writeFile(
      path.join(codexHome, 'config.toml'),
      'model = "gpt-5.6-terra"\n',
      'utf8',
    );

    // Exercise the host-dependent case explicitly: the suite must remove even
    // mixed-case inherited keys before starting the server.
    process.env.OpenAI_Api_Key = 'ambient-test-only';
    isolateExternalProcessEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'codex',
      agentCliEnv: {
        codex: codexTestEnv(fakeCodex, codexHome),
      },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const failed = await sendRunAndWait(started.url, projectId, conversationId);

    expect(failed.status).toBe('failed');
    expect(failed.errorCode).toBe('AGENT_EXECUTION_FAILED');
    expect(failed.failureCategory).toBe('model_unavailable');
    expect(failed.failureDetail).toBe('cli_version_incompatible');
    expect(failed.exitCode).toBeNull();
    await expect(pathExists(spawnMarker)).resolves.toBe(false);
  });

  it('rejects an explicit model outside the Codex catalog before spawning', async () => {
    const fixture = await startCodexFixture();
    const { projectId, conversationId } = await createConversation(fixture.url);
    const failed = await sendRunAndWait(fixture.url, projectId, conversationId, {
      model: 'gpt-unsupported-future',
    });

    expect(failed).toMatchObject({
      status: 'failed',
      errorCode: 'MODEL_UNAVAILABLE',
      failureCategory: 'model_unavailable',
    });
    await expect(pathExists(fixture.spawnMarker)).resolves.toBe(false);
  });

  it('fails closed when live compatibility cannot prove explicit Codex settings', async () => {
    const fixture = await startCodexFixture({ seedCatalog: false });
    const { projectId, conversationId } = await createConversation(fixture.url);
    const failed = await sendRunAndWait(fixture.url, projectId, conversationId, {
      model: 'gpt-5.6-sol',
      reasoning: 'xhigh',
    });

    expect(failed).toMatchObject({
      status: 'failed',
      errorCode: 'MODEL_UNAVAILABLE',
      failureCategory: 'model_unavailable',
      failureAction: 'upgrade',
    });
    await expect(pathExists(fixture.spawnMarker)).resolves.toBe(false);
  });

  it('rejects an unsupported explicit reasoning level before spawning', async () => {
    const fixture = await startCodexFixture();
    const { projectId, conversationId } = await createConversation(fixture.url);
    const failed = await sendRunAndWait(fixture.url, projectId, conversationId, {
      model: 'gpt-5.6-sol',
      reasoning: 'minimal',
    });

    expect(failed).toMatchObject({
      status: 'failed',
      errorCode: 'MODEL_UNAVAILABLE',
      failureCategory: 'model_unavailable',
    });
    await expect(pathExists(fixture.spawnMarker)).resolves.toBe(false);
  });

  it('rejects an unsupported tier without switching the explicit Codex model', async () => {
    const fixture = await startCodexFixture();
    const { projectId, conversationId } = await createConversation(fixture.url);
    const failed = await sendRunAndWait(fixture.url, projectId, conversationId, {
      model: 'gpt-5.1',
      serviceTier: 'fast',
    });

    expect(failed).toMatchObject({
      status: 'failed',
      errorCode: 'MODEL_UNAVAILABLE',
      failureCategory: 'model_unavailable',
    });
    expect(failed.error).toContain("'gpt-5.1'");
    await expect(pathExists(fixture.spawnMarker)).resolves.toBe(false);
  });

  it('launches the exact live-catalog model, reasoning, and service tier unchanged', async () => {
    const fixture = await startCodexFixture();
    const { projectId, conversationId } = await createConversation(fixture.url);
    const finished = await sendRunAndWait(fixture.url, projectId, conversationId, {
      model: 'gpt-5.6-sol',
      reasoning: 'xhigh',
      serviceTier: 'fast',
    });

    expect(finished.status).toBe('succeeded');
    const args = JSON.parse(await readFile(fixture.spawnMarker, 'utf8')) as string[];
    expect(args).toContain('gpt-5.6-sol');
    expect(args).toContain('model_reasoning_effort="xhigh"');
    expect(args).toContain('service_tier="fast"');
    expect(args).not.toContain('gpt-5.5');
  });

  it('continues to Codex exec at the known-compatible version without consulting a model catalog', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'od-codex-model-compatible-'));
    const codexHome = path.join(tempDir, 'codex-home');
    const spawnMarker = path.join(tempDir, 'codex-exec-spawned');
    const fakeCodex = await writeFakeCodex(tempDir, spawnMarker, {
      version: 'codex-cli 0.143.0',
      spawnSucceeds: true,
    });
    await mkdir(codexHome, { recursive: true });
    await writeFile(
      path.join(codexHome, 'config.toml'),
      'model = "gpt-5.6-terra"\n',
      'utf8',
    );

    isolateExternalProcessEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'codex',
      agentCliEnv: {
        codex: codexTestEnv(fakeCodex, codexHome),
      },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const finished = await sendRunAndWait(started.url, projectId, conversationId);

    expect(finished.status).toBe('succeeded');
    await expect(pathExists(spawnMarker)).resolves.toBe(true);
  });

  it('does not overwrite cancellation while the version probe is in flight', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'od-codex-model-cancel-'));
    const codexHome = path.join(tempDir, 'codex-home');
    const spawnMarker = path.join(tempDir, 'codex-exec-spawned');
    const probeMarker = path.join(tempDir, 'codex-version-probed');
    const loginProbeMarker = path.join(tempDir, 'codex-login-probed');
    const fakeCodex = await writeFakeCodex(tempDir, spawnMarker, {
      version: 'codex-cli 0.142.5',
      versionDelayMs: 750,
      versionProbeMarker: probeMarker,
      loginProbeMarker,
    });
    await mkdir(codexHome, { recursive: true });
    await writeFile(
      path.join(codexHome, 'config.toml'),
      'model = "gpt-5.6-terra"\n',
      'utf8',
    );

    isolateExternalProcessEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'codex',
      agentCliEnv: {
        codex: codexTestEnv(fakeCodex, codexHome),
      },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createConversation(started.url);
    const runId = await startRun(started.url, projectId, conversationId);
    await waitForPath(probeMarker);
    const cancel = await fetch(
      `${started.url}/api/runs/${encodeURIComponent(runId)}/cancel`,
      { method: 'POST' },
    );
    expect(cancel.status).toBe(200);

    await waitForPath(loginProbeMarker);
    // The login marker is written just before the auth probe exits. Give the
    // awaiting preflight continuation time to run, then read status again so
    // this catches any late error emission after cancellation.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const canceled = await getRun(started.url, runId);
    expect(canceled.status).toBe('canceled');
    expect(canceled.error).toBeNull();
    expect(canceled.errorCode).toBeNull();
    expect(canceled.failureCategory).toBeNull();
    expect(canceled.failureDetail).toBeNull();
    expect(canceled.exitCode).toBeNull();
    await expect(pathExists(spawnMarker)).resolves.toBe(false);
  });

  async function startCodexFixture(
    options: { seedCatalog?: boolean } = {},
  ): Promise<StartedServer & { spawnMarker: string }> {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'od-codex-selection-preflight-'));
    const codexHome = path.join(tempDir, 'codex-home');
    const spawnMarker = path.join(tempDir, 'codex-exec-spawned');
    const fakeCodex = await writeFakeCodex(tempDir, spawnMarker, {
      version: 'codex-cli 0.143.0',
      spawnSucceeds: true,
    });
    await mkdir(codexHome, { recursive: true });
    isolateExternalProcessEnv();
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'codex',
      agentCliEnv: { codex: codexTestEnv(fakeCodex, codexHome) },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });
    if (options.seedCatalog !== false) rememberLiveModels('codex', [
      { id: 'default', label: 'Default (CLI config)' },
      {
        id: 'gpt-5.6-sol',
        label: 'gpt-5.6-sol',
        supportedReasoningLevels: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
        serviceTierOptions: [{ id: 'fast', label: 'Fast' }],
      },
      {
        id: 'gpt-5.1',
        label: 'gpt-5.1',
        supportedReasoningLevels: ['none', 'minimal', 'low', 'medium', 'high'],
      },
    ]);
    else clearRememberedLiveModels('codex');
    return { ...started, spawnMarker };
  }
});

function snapshotEnv(): EnvSnapshot {
  return {
    keys: EXTERNAL_ENV_KEYS,
    entries: Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string'
        && EXTERNAL_ENV_KEYS.some(
          (expected) => entry[0].toUpperCase() === expected,
        ),
    ),
  };
}

function deleteEnvKeysCaseInsensitive(keys: readonly string[]): void {
  const normalized = new Set(keys.map((key) => key.toUpperCase()));
  for (const key of Object.keys(process.env)) {
    if (normalized.has(key.toUpperCase())) delete process.env[key];
  }
}

function restoreEnv(snapshot: EnvSnapshot): void {
  deleteEnvKeysCaseInsensitive(snapshot.keys);
  for (const [key, value] of snapshot.entries) {
    process.env[key] = value;
  }
}

function isolateExternalProcessEnv(): void {
  deleteEnvKeysCaseInsensitive(EXTERNAL_ENV_KEYS);
}

async function writeFakeCodex(
  dir: string,
  spawnMarker: string,
  options: {
    version?: string;
    versionDelayMs?: number;
    versionProbeMarker?: string;
    loginProbeMarker?: string;
    spawnSucceeds?: boolean;
    models?: Array<Record<string, unknown>>;
  } = {},
): Promise<string> {
  const script = path.join(dir, 'fake-codex.cjs');
  await writeFile(
    script,
    `
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--version')) {
  ${options.versionProbeMarker
    ? `fs.writeFileSync(${JSON.stringify(options.versionProbeMarker)}, '1');`
    : ''}
  setTimeout(() => {
    console.log(${JSON.stringify(options.version ?? 'codex-cli 0.142.5')});
    process.exit(0);
  }, ${JSON.stringify(options.versionDelayMs ?? 0)});
} else if (args[0] === 'debug' && args[1] === 'models') {
  console.log(JSON.stringify({ models: ${JSON.stringify(options.models ?? [
    {
      slug: 'gpt-5.6-sol',
      display_name: 'gpt-5.6-sol',
      visibility: 'list',
      supported_reasoning_levels: [
        { effort: 'low' },
        { effort: 'medium' },
        { effort: 'high' },
        { effort: 'xhigh' },
        { effort: 'max' },
        { effort: 'ultra' },
      ],
      additional_speed_tiers: ['fast'],
    },
    {
      slug: 'gpt-5.1',
      display_name: 'gpt-5.1',
      visibility: 'list',
      supported_reasoning_levels: [
        { effort: 'none' },
        { effort: 'minimal' },
        { effort: 'low' },
        { effort: 'medium' },
        { effort: 'high' },
      ],
    },
  ])} }));
  process.exit(0);
} else if (args[0] === 'login' && args[1] === 'status') {
  ${options.loginProbeMarker
    ? `fs.writeFileSync(${JSON.stringify(options.loginProbeMarker)}, '1');`
    : ''}
  console.log('Logged in using ChatGPT');
  process.exit(0);
} else {
  fs.writeFileSync(${JSON.stringify(spawnMarker)}, JSON.stringify(args));
  if (${JSON.stringify(options.spawnSucceeds === true)}) {
    console.log(JSON.stringify({ type: 'thread.started', thread_id: '019f-test-preflight-compatible' }));
    console.log(JSON.stringify({ type: 'turn.started' }));
    console.log(JSON.stringify({
      type: 'item.completed',
      item: { id: 'item-1', type: 'agent_message', text: 'Compatible model reply.' },
    }));
    console.log(JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 3 },
    }));
    setTimeout(() => process.exit(0), 20);
  } else {
    process.stderr.write("The 'gpt-5.6-terra' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again.\\n");
    process.exit(1);
  }
}
`,
    'utf8',
  );
  const bin = path.join(dir, process.platform === 'win32' ? 'codex-old.cmd' : 'codex-old');
  if (process.platform === 'win32') {
    await writeFile(
      bin,
      `@echo off\r\n"${process.execPath}" "${script}" %*\r\nexit /b %ERRORLEVEL%\r\n`,
      'utf8',
    );
  } else {
    await writeFile(
      bin,
      `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`,
      'utf8',
    );
    await chmod(bin, 0o755);
  }
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

function codexTestEnv(fakeCodex: string, codexHome: string): Record<string, string> {
  return {
    CODEX_BIN: fakeCodex,
    CODEX_HOME: codexHome,
  };
}

async function createConversation(
  url: string,
): Promise<{ projectId: string; conversationId: string }> {
  const projectId = `codex_preflight_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Codex model capability preflight',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const body = (await projectResponse.json()) as { conversationId: string };
  return { projectId, conversationId: body.conversationId };
}

async function sendRunAndWait(
  url: string,
  projectId: string,
  conversationId: string,
  options: { model?: string; reasoning?: string; serviceTier?: string } = {},
): Promise<RunStatus> {
  const runId = await startRun(url, projectId, conversationId, options);
  return await waitForRun(url, runId);
}

async function startRun(
  url: string,
  projectId: string,
  conversationId: string,
  options: { model?: string; reasoning?: string; serviceTier?: string } = {},
): Promise<string> {
  const response = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId: `assistant_codex_preflight_${randomUUID()}`,
      clientRequestId: `client_codex_preflight_${randomUUID()}`,
      agentId: 'codex',
      model: options.model ?? 'default',
      ...(options.reasoning ? { reasoning: options.reasoning } : {}),
      ...(options.serviceTier ? { serviceTier: options.serviceTier } : {}),
      message: 'Create a small text artifact.',
      currentPrompt: 'Create a small text artifact.',
    }),
  });
  expect(response.status).toBe(202);
  const body = (await response.json()) as { runId: string };
  return body.runId;
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const run = await getRun(url, runId);
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${runId} did not finish`);
}

async function getRun(url: string, runId: string): Promise<RunStatus> {
  const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
  expect(response.status).toBe(200);
  return (await response.json()) as RunStatus;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitForPath(filePath: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    if (await pathExists(filePath)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`path did not appear: ${filePath}`);
}
