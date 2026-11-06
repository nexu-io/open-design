import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import { logicalPluginRequestDigest } from '../src/mcp-observability.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

describe('run request idempotency', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;

  afterEach(async () => {
    await stopServer(started);
    started = null;
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
    restoreEnv(originalEnv);
  });

  it('returns the same logical run when a lost POST /api/runs response is retried', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-idempotency-bin-'));
    const { bin, invocationPath } = await writeSuccessfulClaude(binDir);
    started = await startWithFakeClaude(bin);
    const request = await createRunRequest(started.url);

    // Treat the first response as lost: the caller never consumes its body.
    const first = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(first.status).toBe(202);

    const retried = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(retried.status).toBe(202);
    const retriedBody = await retried.json() as {
      runId: string;
      reused?: boolean;
      clientRequestId?: string;
    };
    expect(retriedBody).toMatchObject({
      reused: true,
      clientRequestId: request.clientRequestId,
    });

    await waitForRun(started.url, retriedBody.runId);
    expect((await readFile(invocationPath, 'utf8')).trim().split('\n')).toHaveLength(1);
  });

  it('rejects reusing one clientRequestId for a different logical request', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-idempotency-conflict-bin-'));
    const { bin } = await writeSuccessfulClaude(binDir);
    started = await startWithFakeClaude(bin);
    const request = await createRunRequest(started.url);

    const first = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(first.status).toBe(202);

    const conflict = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...request, message: 'different task', currentPrompt: 'different task' }),
    });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: 'IDEMPOTENCY_CONFLICT' },
    });
  });

  it('treats execution-shaping fields omitted by the legacy fingerprint as idempotency conflicts', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-idempotency-shape-bin-'));
    const { bin } = await writeSuccessfulClaude(binDir);
    started = await startWithFakeClaude(bin);
    const request = {
      ...(await createRunRequest(started.url)),
      systemPrompt: 'first execution policy',
      attachments: [{ type: 'text', name: 'context.txt', content: 'first' }],
      locale: 'en',
    };

    const first = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(first.status).toBe(202);

    const conflict = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...request,
        systemPrompt: 'different execution policy',
        attachments: [{ type: 'text', name: 'context.txt', content: 'different' }],
      }),
    });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: 'IDEMPOTENCY_CONFLICT' },
    });
  });

  it('keeps the request-to-run mapping across a daemon restart', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-idempotency-restart-bin-'));
    const { bin, invocationPath } = await writeSuccessfulClaude(binDir);
    started = await startWithFakeClaude(bin);
    const request = await createRunRequest(started.url);

    const first = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(first.status).toBe(202);
    const firstBody = await first.json() as { runId: string };
    await waitForRun(started.url, firstBody.runId);
    await stopServer(started);
    started = await startWithFakeClaude(bin);
    const generationInvocationsBeforeRetry = generationInvocationLines(
      await readFile(invocationPath, 'utf8'),
    );

    const retried = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(retried.status).toBe(202);
    await expect(retried.json()).resolves.toMatchObject({
      runId: firstBody.runId,
      reused: true,
      clientRequestId: request.clientRequestId,
    });
    expect(generationInvocationLines(await readFile(invocationPath, 'utf8')))
      .toEqual(generationInvocationsBeforeRetry);
  });

  it('persists one immutable workflow-to-run binding across daemon restarts', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-plugin-workflow-bin-'));
    const { bin } = await writeSuccessfulClaude(binDir);
    started = await startWithFakeClaude(bin);
    const base = await createRunRequest(started.url);
    const clientRequestId = randomUUID();
    const pluginWorkflowId = randomUUID();
    const logical = logicalPluginRequestDigest(clientRequestId);
    const request = {
      ...base,
      clientRequestId,
      analyticsHints: {
        entrySurface: 'external_mcp',
        hostProduct: 'codex_unknown',
        externalPluginId: 'open-design',
        externalPluginVersion: '0.4.0',
        distributionMechanism: 'git_marketplace',
        publisherClass: 'open_design_first_party',
        attributionQuality: 'self_reported',
        pluginWorkflowId,
        logicalRequestDigest: logical.digest,
        logicalRequestDigestVersion: logical.version,
        briefState: 'not_applicable',
      },
    };

    const first = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-od-analytics-device-id': 'test-installation-plugin-workflow',
        'x-od-analytics-client-type': 'external_mcp',
      },
      body: JSON.stringify(request),
    });
    expect(first.status).toBe(202);
    const firstBody = await first.json() as { runId: string };
    await waitForRun(started.url, firstBody.runId);
    const acceptedRun = await fetch(
      `${started.url}/api/runs/${encodeURIComponent(firstBody.runId)}`,
    );
    await expect(acceptedRun.json()).resolves.toMatchObject({
      clientType: 'external_mcp',
    });

    const bindingBeforeRestart = await fetch(
      `${started.url}/api/runs/by-plugin-workflow/${pluginWorkflowId}`,
    );
    expect(bindingBeforeRestart.status).toBe(200);
    await expect(bindingBeforeRestart.json()).resolves.toMatchObject({
      runId: firstBody.runId,
      projectId: request.projectId,
      pluginWorkflowId,
      logicalRequestDigest: logical.digest,
      externalPluginContext: {
        id: 'open-design',
        version: '0.4.0',
        distributionMechanism: 'git_marketplace',
        publisherClass: 'open_design_first_party',
      },
    });

    await stopServer(started);
    started = await startWithFakeClaude(bin);
    const bindingAfterRestart = await fetch(
      `${started.url}/api/runs/by-plugin-workflow/${pluginWorkflowId}`,
    );
    expect(bindingAfterRestart.status).toBe(200);
    await expect(bindingAfterRestart.json()).resolves.toMatchObject({
      runId: firstBody.runId,
      projectId: request.projectId,
      pluginWorkflowId,
      logicalRequestDigest: logical.digest,
    });

    const conflictingRequestId = randomUUID();
    const conflictLogical = logicalPluginRequestDigest(conflictingRequestId);
    const conflict = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...request,
        clientRequestId: conflictingRequestId,
        analyticsHints: {
          ...request.analyticsHints,
          logicalRequestDigest: conflictLogical.digest,
        },
      }),
    });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: 'PLUGIN_WORKFLOW_CONFLICT' },
    });
  });

  it('persists the terminal Plugin HTML version origin on the Run', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-plugin-artifact-origin-bin-'));
    const { bin } = await writeSuccessfulClaude(binDir, { writeHtml: true });
    started = await startWithFakeClaude(bin);
    const base = await createRunRequest(started.url);
    const clientRequestId = randomUUID();
    const pluginWorkflowId = randomUUID();
    const logical = logicalPluginRequestDigest(clientRequestId);
    const response = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-od-analytics-device-id': 'test-installation-plugin-artifact',
        'x-od-analytics-client-type': 'external_mcp',
      },
      body: JSON.stringify({
        ...base,
        clientRequestId,
        analyticsHints: {
          entrySurface: 'external_mcp',
          hostProduct: 'codex_unknown',
          externalPluginId: 'open-design',
          externalPluginVersion: '0.4.0',
          distributionMechanism: 'git_marketplace',
          publisherClass: 'open_design_first_party',
          attributionQuality: 'self_reported',
          pluginWorkflowId,
          logicalRequestDigest: logical.digest,
          logicalRequestDigestVersion: logical.version,
          briefState: 'not_applicable',
        },
      }),
    });
    expect(response.status).toBe(202);
    const body = await response.json() as { runId: string };
    await waitForRun(started.url, body.runId);

    const terminal = await fetch(
      `${started.url}/api/runs/${encodeURIComponent(body.runId)}`,
    );
    await expect(terminal.json()).resolves.toMatchObject({
      status: 'succeeded',
      artifactCount: 1,
      deliverableValid: true,
      deliverableValidation: 'valid',
      deliverableEntryFile: 'index.html',
      deliverableArtifactKind: 'html',
      artifactOriginStatus: 'matched',
      artifactVersionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });
});

function snapshotEnv(): Record<string, string | undefined> {
  return {
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
  };
}

function restoreEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function startWithFakeClaude(bin: string): Promise<StartedServer> {
  delete process.env.POSTHOG_KEY;
  delete process.env.POSTHOG_HOST;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_BASE_URL;
  delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
  const server = await startServer({ port: 0, returnServer: true }) as StartedServer;
  const response = await fetch(`${server.url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: bin } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    }),
  });
  expect(response.status).toBe(200);
  return server;
}

async function createRunRequest(url: string) {
  const projectId = `idempotency_${randomUUID()}`;
  const project = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Idempotency smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(project.status).toBe(200);
  const body = await project.json() as { conversationId: string };
  return {
    projectId,
    conversationId: body.conversationId,
    assistantMessageId: `assistant_${randomUUID()}`,
    clientRequestId: `client_${randomUUID()}`,
    agentId: 'claude',
    message: 'create one artifact',
    currentPrompt: 'create one artifact',
  };
}

async function writeSuccessfulClaude(dir: string): Promise<{
  bin: string;
  invocationPath: string;
}>;
async function writeSuccessfulClaude(
  dir: string,
  options: { writeHtml?: boolean },
): Promise<{
  bin: string;
  invocationPath: string;
}>;
async function writeSuccessfulClaude(
  dir: string,
  options: { writeHtml?: boolean } = {},
): Promise<{
  bin: string;
  invocationPath: string;
}> {
  const bin = path.join(dir, 'claude');
  const invocationPath = path.join(dir, 'invocations.jsonl');
  await writeFile(
    bin,
    `#!/usr/bin/env node
const fs = require('node:fs');
const invocationPath = ${JSON.stringify(invocationPath)};
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p'); process.exit(0); }
fs.appendFileSync(invocationPath, JSON.stringify(process.argv.slice(2)) + '\\n');
${options.writeHtml ? "fs.writeFileSync(require('node:path').join(process.cwd(), 'index.html'), '<!doctype html><title>Plugin artifact</title>');" : ''}
console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'idempotency-test' }));
console.log(JSON.stringify({
  type: 'assistant',
  message: {
    id: 'msg-idempotency',
    content: [{ type: 'text', text: 'done' }],
    stop_reason: 'end_turn'
  }
}));
setTimeout(() => process.exit(0), 20);
`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return { bin, invocationPath };
}

async function waitForRun(url: string, runId: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as { status: string };
    if (['succeeded', 'failed', 'canceled'].includes(run.status)) {
      expect(run.status).toBe('succeeded');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`run ${runId} did not finish`);
}

function generationInvocationLines(raw: string): string[] {
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter((line) => {
      const args = JSON.parse(line) as string[];
      return args.includes('--output-format');
    });
}

async function stopServer(server: StartedServer | null): Promise<void> {
  if (!server) return;
  await Promise.resolve(server.shutdown?.());
  if (server.server.listening) {
    await new Promise<void>((resolve) => server.server.close(() => resolve()));
  }
}
