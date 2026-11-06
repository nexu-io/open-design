import type http from 'node:http';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../../src/server.js';
import { memoryDir, writeMemoryConfig } from '../../src/memory.js';
import { resolveLegacyMediaRouteGrant } from '../../src/routes/media.js';

type FakeMediaEndpoint = 'tool' | 'legacy';

interface FakeMediaAgentOptions {
  endpoint?: FakeMediaEndpoint;
  attachToken?: boolean;
}

describe('run-scoped media policy routes', () => {
  let tempDir: string;
  let binDir: string;
  let oldPath: string | undefined;
  let oldCapture: string | undefined;
  let oldMemoryConfigRaw: string | null = null;
  let server: http.Server | null = null;
  let shutdown: (() => Promise<void> | void) | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'od-media-policy-route-'));
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-media-policy-bin-'));
    oldPath = process.env.PATH;
    oldCapture = process.env.OD_CAPTURE_MEDIA_RESPONSE;
    process.env.PATH = `${binDir}${path.delimiter}${oldPath ?? ''}`;
    const memoryConfig = memoryConfigPath();
    oldMemoryConfigRaw = await readFile(memoryConfig, 'utf8').catch(() => null);
    await writeMemoryConfig(process.env.OD_DATA_DIR!, {
      chatExtractionEnabled: false,
      extraction: null,
    });
  });

  afterEach(async () => {
    await Promise.resolve(shutdown?.());
    shutdown = undefined;
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    if (oldCapture === undefined) delete process.env.OD_CAPTURE_MEDIA_RESPONSE;
    else process.env.OD_CAPTURE_MEDIA_RESPONSE = oldCapture;
    const memoryConfig = memoryConfigPath();
    if (oldMemoryConfigRaw === null) {
      await rm(memoryConfig, { force: true });
    } else {
      await mkdir(path.dirname(memoryConfig), { recursive: true });
      await writeFile(memoryConfig, oldMemoryConfigRaw);
    }
    oldMemoryConfigRaw = null;
    await rm(tempDir, { recursive: true, force: true });
    await rm(binDir, { recursive: true, force: true });
  });

  it('rejects in-run media generation when media execution is disabled', async () => {
    const capturePath = path.join(tempDir, 'media-disabled-response.json');
    await writeFakeAgent(capturePath, {
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'Create a launch poster',
      output: 'poster.png',
    });

    const { url, projectId, conversationId } = await startProjectServer('Disabled media project');

    const createResponse = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        projectId,
        conversationId,
        message: 'Try to create a poster image.',
        mediaExecution: { mode: 'disabled' },
      }),
    });
    expect(createResponse.status).toBe(202);

    const captured = await waitForCapturedMediaResponse(capturePath);
    expect(captured.status).toBe(403);
    expect(captured.tokenAvailable).toBe(true);
    expect(captured.body.error).toMatchObject({
      code: 'MEDIA_EXECUTION_DISABLED',
    });
  });

  it('preserves no-token legacy media generation when run media execution is disabled', async () => {
    const capturePath = path.join(tempDir, 'legacy-no-token-disabled-response.json');
    await writeFakeAgent(
      capturePath,
      {
        surface: 'image',
        model: 'test-image-model',
        prompt: 'Create a launch poster',
        output: 'poster.png',
      },
      { endpoint: 'legacy', attachToken: false },
    );

    const { url, projectId, conversationId } = await startProjectServer(
      'Legacy no-token media project',
    );

    const createResponse = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        projectId,
        conversationId,
        message: 'Try to create a poster image through the legacy path.',
        mediaExecution: { mode: 'disabled' },
      }),
    });
    expect(createResponse.status).toBe(202);

    const captured = await waitForCapturedMediaResponse(capturePath);
    expect(captured.status).toBe(202);
    expect(captured.tokenAvailable).toBe(true);
    expect(captured.tokenAttached).toBe(false);
  });

  it('allows token-bearing legacy media generation when enabled policy permits it', async () => {
    const capturePath = path.join(tempDir, 'legacy-token-enabled-response.json');
    await writeFakeAgent(
      capturePath,
      {
        surface: 'image',
        model: 'test-image-model',
        prompt: 'Create a launch poster',
        output: 'poster.png',
      },
      { endpoint: 'legacy' },
    );

    const { url, projectId, conversationId } = await startProjectServer(
      'Legacy token-enabled media project',
    );

    const createResponse = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        projectId,
        conversationId,
        message: 'Try to create a poster image through the legacy path.',
        mediaExecution: {
          mode: 'enabled',
          allowedSurfaces: ['image'],
          allowedModels: ['test-image-model'],
        },
      }),
    });
    expect(createResponse.status).toBe(202);

    const captured = await waitForCapturedMediaResponse(capturePath);
    expect(captured.status).toBe(202);
    expect(captured.tokenAvailable).toBe(true);
    expect(captured.tokenAttached).toBe(true);
  });

  it('rejects token-bearing legacy media generation when media execution is disabled', async () => {
    const capturePath = path.join(tempDir, 'legacy-token-disabled-response.json');
    await writeFakeAgent(
      capturePath,
      {
        surface: 'image',
        model: 'gpt-image-2',
        prompt: 'Create a launch poster',
        output: 'poster.png',
      },
      { endpoint: 'legacy' },
    );

    const { url, projectId, conversationId } = await startProjectServer(
      'Legacy token-disabled media project',
    );

    const createResponse = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        projectId,
        conversationId,
        message: 'Try to create a poster image through the legacy path.',
        mediaExecution: { mode: 'disabled' },
      }),
    });
    expect(createResponse.status).toBe(202);

    const captured = await waitForCapturedMediaResponse(capturePath);
    expect(captured.status).toBe(403);
    expect(captured.tokenAvailable).toBe(true);
    expect(captured.tokenAttached).toBe(true);
    expect(captured.body.error).toMatchObject({
      code: 'MEDIA_EXECUTION_DISABLED',
    });
  });

  it('rejects disallowed surfaces and models on token-bearing legacy media generation', async () => {
    const surfaceCapturePath = path.join(tempDir, 'legacy-surface-denied.json');
    await writeFakeAgent(
      surfaceCapturePath,
      {
        surface: 'image',
        model: 'gpt-image-2',
        prompt: 'Create a launch poster',
        output: 'poster.png',
      },
      { endpoint: 'legacy' },
    );
    const surfaceProject = await startProjectServer('Legacy surface denied media project');
    const surfaceResponse = await fetch(`${surfaceProject.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        projectId: surfaceProject.projectId,
        conversationId: surfaceProject.conversationId,
        message: 'Try to create a poster image through the legacy path.',
        mediaExecution: {
          mode: 'enabled',
          allowedSurfaces: ['video'],
        },
      }),
    });
    expect(surfaceResponse.status).toBe(202);
    const surfaceCaptured = await waitForCapturedMediaResponse(surfaceCapturePath);
    expect(surfaceCaptured.status).toBe(403);
    expect(surfaceCaptured.tokenAttached).toBe(true);
    expect(surfaceCaptured.body.error).toMatchObject({
      code: 'MEDIA_SURFACE_DENIED',
    });

    const modelCapturePath = path.join(tempDir, 'legacy-model-denied.json');
    await writeFakeAgent(
      modelCapturePath,
      {
        surface: 'image',
        model: 'gpt-image-2',
        prompt: 'Create a launch poster',
        output: 'poster.png',
      },
      { endpoint: 'legacy' },
    );
    const modelProject = await startProjectServer('Legacy model denied media project');
    const modelResponse = await fetch(`${modelProject.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        projectId: modelProject.projectId,
        conversationId: modelProject.conversationId,
        message: 'Try to create a poster image through the legacy path.',
        mediaExecution: {
          mode: 'enabled',
          allowedModels: ['different-image-model'],
        },
      }),
    });
    expect(modelResponse.status).toBe(202);
    const modelCaptured = await waitForCapturedMediaResponse(modelCapturePath);
    expect(modelCaptured.status).toBe(403);
    expect(modelCaptured.tokenAttached).toBe(true);
    expect(modelCaptured.body.error).toMatchObject({
      code: 'MEDIA_MODEL_DENIED',
    });
  });

  it('rejects disallowed surfaces and models on token-gated media generation', async () => {
    const surfaceCapturePath = path.join(tempDir, 'media-surface-denied.json');
    await writeFakeAgent(surfaceCapturePath, {
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'Create a launch poster',
      output: 'poster.png',
    });
    const surfaceProject = await startProjectServer('Surface denied media project');
    const surfaceResponse = await fetch(`${surfaceProject.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        projectId: surfaceProject.projectId,
        conversationId: surfaceProject.conversationId,
        message: 'Try to create a poster image.',
        mediaExecution: {
          mode: 'enabled',
          allowedSurfaces: ['video'],
        },
      }),
    });
    expect(surfaceResponse.status).toBe(202);
    const surfaceCaptured = await waitForCapturedMediaResponse(surfaceCapturePath);
    expect(surfaceCaptured.status).toBe(403);
    expect(surfaceCaptured.body.error).toMatchObject({
      code: 'MEDIA_SURFACE_DENIED',
    });

    const modelCapturePath = path.join(tempDir, 'media-model-denied.json');
    await writeFakeAgent(modelCapturePath, {
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'Create a launch poster',
      output: 'poster.png',
    });
    const modelProject = await startProjectServer('Model denied media project');
    const modelResponse = await fetch(`${modelProject.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        projectId: modelProject.projectId,
        conversationId: modelProject.conversationId,
        message: 'Try to create a poster image.',
        mediaExecution: {
          mode: 'enabled',
          allowedModels: ['different-image-model'],
        },
      }),
    });
    expect(modelResponse.status).toBe(202);
    const modelCaptured = await waitForCapturedMediaResponse(modelCapturePath);
    expect(modelCaptured.status).toBe(403);
    expect(modelCaptured.body.error).toMatchObject({
      code: 'MEDIA_MODEL_DENIED',
    });
  });

  it('applies legacy chat disabled policy to the spawned media tool path', async () => {
    const capturePath = path.join(tempDir, 'legacy-chat-disabled-response.json');
    await writeFakeAgent(capturePath, {
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'Create a launch poster',
      output: 'poster.png',
    });

    const { url, projectId, conversationId } = await startProjectServer(
      'Legacy chat disabled media project',
    );

    const chatResponse = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        projectId,
        conversationId,
        message: 'Create a poster image from legacy chat.',
        mediaExecution: { mode: 'disabled' },
      }),
    });
    expect(chatResponse.status).toBe(200);

    const captured = await waitForCapturedMediaResponse(capturePath);
    expect(captured.status).toBe(403);
    expect(captured.tokenAvailable).toBe(true);
    expect(captured.body.error).toMatchObject({
      code: 'MEDIA_EXECUTION_DISABLED',
    });

    await chatResponse.text();
  });

  it('defaults omitted mediaExecution to enabled on run and legacy chat creation', async () => {
    const { url, projectId, conversationId } = await startProjectServer('Default policy project');

    const runResponse = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId,
        conversationId,
        message: 'Create a poster image.',
      }),
    });
    expect(runResponse.status).toBe(202);
    const runBody = await runResponse.json() as { runId: string };
    const runStatusResponse = await fetch(`${url}/api/runs/${encodeURIComponent(runBody.runId)}`);
    const runStatus = await runStatusResponse.json() as {
      mediaExecution?: { mode?: string };
    };
    expect(runStatus.mediaExecution).toEqual({ mode: 'enabled' });

    const legacyConversationId = `legacy-${randomUUID()}`;
    const chatResponse = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId,
        conversationId: legacyConversationId,
        message: 'Create a poster image.',
      }),
    });
    expect(chatResponse.status).toBe(200);
    await chatResponse.text();
    const runsResponse = await fetch(
      `${url}/api/runs?conversationId=${encodeURIComponent(legacyConversationId)}`,
    );
    const runsBody = await runsResponse.json() as {
      runs: Array<{ mediaExecution?: { mode?: string } }>;
    };
    expect(runsBody.runs).toHaveLength(1);
    expect(runsBody.runs[0]?.mediaExecution).toEqual({ mode: 'enabled' });
  });

  it('fails closed when a media tool request does not carry a valid run token', async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    server = started.server;
    shutdown = started.shutdown;

    const response = await fetch(`${started.url}/api/tools/media/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid-token',
      },
      body: JSON.stringify({
        surface: 'image',
        model: 'gpt-image-2',
        prompt: 'Create a launch poster',
      }),
    });

    expect(response.status).toBe(401);
    const body = await response.json() as { error?: { code?: string } };
    expect(body.error).toMatchObject({ code: 'TOOL_TOKEN_INVALID' });
  });

  it('requires a run token for the legacy media route only in sandbox mode', () => {
    const requestProjectOverride = (projectId: string, tokenProjectId: string) =>
      projectId !== tokenProjectId;

    expect(
      resolveLegacyMediaRouteGrant({
        grant: null,
        projectId: 'project-1',
        requestProjectOverride,
        sandboxMode: false,
      }),
    ).toEqual({ ok: true, grant: null });

    expect(
      resolveLegacyMediaRouteGrant({
        grant: null,
        projectId: 'project-1',
        requestProjectOverride,
        sandboxMode: true,
      }),
    ).toMatchObject({
      code: 'TOOL_TOKEN_MISSING',
      ok: false,
      status: 401,
    });
  });

  it('rejects project overrides on token-bearing legacy media requests in sandbox mode', () => {
    const decision = resolveLegacyMediaRouteGrant({
      grant: {
        allowedEndpoints: ['/api/tools/media/generate'],
        allowedOperations: ['media:generate'],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        issuedAt: new Date().toISOString(),
        projectId: 'token-project',
        runId: 'run-1',
        token: 'token',
      },
      projectId: 'other-project',
      requestProjectOverride: (projectId, tokenProjectId) => projectId !== tokenProjectId,
      sandboxMode: true,
    });

    expect(decision).toMatchObject({
      code: 'FORBIDDEN',
      details: { suppliedProjectId: 'other-project' },
      ok: false,
      status: 403,
    });
  });

  it('preserves token-bearing legacy project overrides outside sandbox mode', () => {
    const decision = resolveLegacyMediaRouteGrant({
      grant: {
        allowedEndpoints: ['/api/tools/media/generate'],
        allowedOperations: ['media:generate'],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        issuedAt: new Date().toISOString(),
        projectId: 'token-project',
        runId: 'run-1',
        token: 'token',
      },
      projectId: 'other-project',
      requestProjectOverride: (projectId, tokenProjectId) => projectId !== tokenProjectId,
      sandboxMode: false,
    });

    expect(decision).toMatchObject({ ok: true });
  });

  async function startProjectServer(name: string): Promise<{
    url: string;
    projectId: string;
    conversationId: string;
  }> {
    if (server) {
      await Promise.resolve(shutdown?.());
      shutdown = undefined;
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }

    const projectId = `project_${randomUUID()}`;
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    server = started.server;
    shutdown = started.shutdown;

    const projectResponse = await fetch(`${started.url}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name,
        metadata: { kind: 'image' },
      }),
    });
    expect(projectResponse.status).toBe(200);
    const projectBody = await projectResponse.json() as { conversationId: string };
    return {
      url: started.url,
      projectId,
      conversationId: projectBody.conversationId,
    };
  }

  function memoryConfigPath(): string {
    return path.join(memoryDir(process.env.OD_DATA_DIR!), '.config.json');
  }

  async function writeFakeAgent(
    capturePath: string,
    requestBody: unknown,
    options: FakeMediaAgentOptions = {},
  ): Promise<void> {
    const endpoint = options.endpoint ?? 'tool';
    const attachToken = options.attachToken ?? true;
    const source = `#!/usr/bin/env node
const fs = require('node:fs');
const endpoint = ${JSON.stringify(endpoint)};
const attachToken = ${JSON.stringify(attachToken)};

(async () => {
  if (process.argv.includes('--version')) {
    console.log('opencode 1.0.0');
    return;
  }
  if (process.argv[2] === 'models') {
    console.log('default');
    return;
  }
  if (process.argv[2] !== 'run') {
    return;
  }
  const token = process.env.OD_TOOL_TOKEN;
  const daemonUrl = process.env.OD_DAEMON_URL;
  if (!token || !daemonUrl) {
    console.log(JSON.stringify({ type: 'text', part: { text: 'media policy skipped' } }));
    return;
  }
  const projectId = process.env.OD_PROJECT_ID;
  const url = endpoint === 'legacy'
    ? daemonUrl + '/api/projects/' + encodeURIComponent(projectId || '') + '/media/generate'
    : daemonUrl + '/api/tools/media/generate';
  const headers = { 'content-type': 'application/json' };
  if (attachToken && token) {
    headers.authorization = 'Bearer ' + token;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(${JSON.stringify(requestBody)}),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  fs.writeFileSync(process.env.OD_CAPTURE_MEDIA_RESPONSE, JSON.stringify({
    status: response.status,
    tokenAvailable: Boolean(token),
    tokenAttached: Boolean(attachToken && token),
    endpoint,
    url,
    body,
  }));
  console.log(JSON.stringify({ type: 'text', part: { text: 'media policy checked' } }));
})().catch((error) => {
  fs.writeFileSync(process.env.OD_CAPTURE_MEDIA_RESPONSE, JSON.stringify({
    status: 0,
    tokenAvailable: Boolean(process.env.OD_TOOL_TOKEN),
    tokenAttached: Boolean(attachToken && process.env.OD_TOOL_TOKEN),
    endpoint,
    body: { error: String(error && error.message ? error.message : error) },
  }));
  process.exit(1);
});
`;
    if (process.platform === 'win32') {
      const runner = path.join(binDir, 'opencode-runner.cjs');
      await writeFile(runner, source.replace(/^#![^\n]*\n/, ''));
      await writeFile(
        path.join(binDir, 'opencode.cmd'),
        `@echo off\r\nnode "${runner}" %*\r\n`,
      );
    } else {
      const bin = path.join(binDir, 'opencode');
      await writeFile(bin, source);
      await chmod(bin, 0o755);
    }
    process.env.OD_CAPTURE_MEDIA_RESPONSE = capturePath;
  }

  async function waitForCapturedMediaResponse(capturePath: string): Promise<{
    status: number;
    tokenAvailable: boolean;
    tokenAttached?: boolean;
    endpoint?: FakeMediaEndpoint;
    url?: string;
    body: any;
  }> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 10_000) {
      try {
        return JSON.parse(await readFile(capturePath, 'utf8'));
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    throw new Error('timed out waiting for fake agent media response');
  }
});
