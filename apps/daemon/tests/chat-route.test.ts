import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  promises as fsp,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  composeLiveInstructionPrompt,
  resolveGrantedCodexImagegenOverride,
  resolveCodexGeneratedImagesDir,
  resolveChatExtraAllowedDirs,
  startServer,
  validateCodexGeneratedImagesDir,
} from '../src/server.js';
import { getAgentDef } from '../src/agents.js';
import { renderCodexImagegenOverride } from '../src/prompts/system.js';

function symlinkDir(target: string, link: string): void {
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}

async function withFakeAgent<T>(
  binName: string,
  script: string,
  run: () => Promise<T>,
): Promise<T> {
  const dir = await fsp.mkdtemp(join(tmpdir(), 'od-chat-route-bin-'));
  const oldPath = process.env.PATH;
  try {
    if (process.platform === 'win32') {
      const runner = join(dir, `${binName}-test-runner.cjs`);
      await fsp.writeFile(runner, script);
      await fsp.writeFile(
        join(dir, `${binName}.cmd`),
        `@echo off\r\nnode "${runner}" %*\r\n`,
      );
    } else {
      const bin = join(dir, binName);
      await fsp.writeFile(bin, `#!/usr/bin/env node\n${script}`);
      await fsp.chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${delimiter}${oldPath ?? ''}`;
    return await run();
  } finally {
    process.env.PATH = oldPath;
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

describe('/api/chat', () => {
  let server: http.Server;
  let baseUrl: string;
  const originalPath = process.env.PATH;
  const originalAgentHome = process.env.OD_AGENT_HOME;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    if (originalPath == null) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalAgentHome == null) {
      delete process.env.OD_AGENT_HOME;
    } else {
      process.env.OD_AGENT_HOME = originalAgentHome;
    }
  });

  afterAll(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    if (!server) return;
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('does not reference an out-of-scope response while starting a run', async () => {
    process.env.PATH = '';
    const emptyAgentHome = mkdtempSync(join(tmpdir(), 'od-empty-agent-home-'));
    tempDirs.push(emptyAgentHome);
    process.env.OD_AGENT_HOME = emptyAgentHome;

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'claude',
        message: 'hello',
      }),
    });
    const body = await response.text();

    expect(response.ok).toBe(true);
    expect(body).not.toContain('res is not defined');
    expect(body).toContain('AGENT_UNAVAILABLE');
  });

  it('marks json stream runs failed when an error frame exits with code 0', async () => {
    const conversationId = `conv-${randomUUID()}`;

    await withFakeAgent(
      'opencode',
      `
console.log(JSON.stringify({
  type: 'error',
  error: { message: 'model not found: fake-opencode-model' },
}));
process.exit(0);
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            conversationId,
            message: 'hello',
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('AGENT_EXECUTION_FAILED');
        expect(body).toContain('model not found: fake-opencode-model');
        expect(body).toContain('"status":"failed"');
        expect(body).not.toContain('"status":"succeeded"');

        const runsResponse = await fetch(
          `${baseUrl}/api/runs?conversationId=${encodeURIComponent(conversationId)}`,
        );
        const runsBody = (await runsResponse.json()) as {
          runs: Array<{ conversationId: string | null; status: string; exitCode: number | null }>;
        };

        expect(runsBody.runs).toHaveLength(1);
        expect(runsBody.runs[0]).toMatchObject({
          conversationId,
          status: 'failed',
          exitCode: 0,
        });
      },
    );
  });

  it('surfaces Qoder assistant error records through the SSE error channel', async () => {
    const binDir = mkdtempSync(join(tmpdir(), 'od-qoder-bin-'));
    tempDirs.push(binDir);
    const qoderBin = join(binDir, 'qodercli');
    const qoderErrorLine = JSON.stringify({
      type: 'assistant',
      message: { content: [] },
      error: { message: 'Qoder authentication expired' },
    });
    writeFileSync(
      qoderBin,
      `#!/bin/sh\nprintf '%s\\n' '${qoderErrorLine}'\nexit 0\n`,
      'utf8',
    );
    chmodSync(qoderBin, 0o755);
    process.env.PATH = binDir;

    const createResponse = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'qoder',
        message: 'hello',
      }),
    });
    expect(createResponse.status).toBe(202);
    const { runId } = await createResponse.json() as { runId: string };

    const eventsController = new AbortController();
    const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
      signal: eventsController.signal,
    });
    const eventsBody = await readSseUntil(eventsResponse, 'event: error');
    eventsController.abort();
    const statusBody = await waitForRunStatus(baseUrl, runId);

    expect(eventsBody).toContain('event: error');
    expect(eventsBody).toContain('Qoder authentication expired');
    expect(eventsBody).not.toContain('event: agent\\ndata: {"type":"error"');
    expect(statusBody.status).toBe('failed');
  });

  it('fails Qoder runs when the result reports is_error with exit code 0', async () => {
    const binDir = mkdtempSync(join(tmpdir(), 'od-qoder-bin-'));
    tempDirs.push(binDir);
    const qoderBin = join(binDir, 'qodercli');
    const qoderResultLine = JSON.stringify({
      type: 'result',
      subtype: 'error',
      duration_ms: 17,
      is_error: true,
      stop_reason: 'tool_use_failed',
      total_cost_usd: 0,
      usage: {
        input_tokens: 3,
        output_tokens: 1,
      },
    });
    writeFileSync(
      qoderBin,
      `#!/bin/sh\nprintf '%s\\n' '${qoderResultLine}'\nexit 0\n`,
      'utf8',
    );
    chmodSync(qoderBin, 0o755);
    process.env.PATH = binDir;

    const createResponse = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'qoder',
        message: 'hello',
      }),
    });
    expect(createResponse.status).toBe(202);
    const { runId } = await createResponse.json() as { runId: string };

    const eventsController = new AbortController();
    const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
      signal: eventsController.signal,
    });
    const eventsBody = await readSseUntil(eventsResponse, 'event: error');
    eventsController.abort();
    const statusBody = await waitForRunStatus(baseUrl, runId);

    expect(eventsBody).toContain('event: agent');
    expect(eventsBody).toContain('"type":"usage"');
    expect(eventsBody).toContain('"isError":true');
    expect(eventsBody).toContain('event: error');
    expect(eventsBody).toContain('Qoder run failed: tool_use_failed');
    expect(statusBody.status).toBe('failed');
  });
});

async function readSseUntil(response: Response, marker: string): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let body = '';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { done, value } = await reader.read();
    if (done) return body;
    body += decoder.decode(value, { stream: true });
    if (body.includes(marker)) return body;
  }
  return body;
}

async function waitForRunStatus(baseUrl: string, runId: string): Promise<{ status: string }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const statusResponse = await fetch(`${baseUrl}/api/runs/${runId}`);
    const statusBody = await statusResponse.json() as { status: string };
    if (statusBody.status !== 'queued' && statusBody.status !== 'running') return statusBody;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('run did not finish');
}

describe('chat prompt helpers', () => {
  it('appends the validated Codex override after the client system prompt and removes earlier duplicates', () => {
    const override = renderCodexImagegenOverride('codex', {
      kind: 'image',
      imageModel: 'gpt-image-2',
      imageAspect: '1:1',
    });
    const clientMediaContract =
      '## Media generation contract\nclient contract wins unless a later override says otherwise';

    const prompt = composeLiveInstructionPrompt({
      daemonSystemPrompt: `daemon prompt\n${override}`,
      runtimeToolPrompt: 'runtime tools',
      clientSystemPrompt: clientMediaContract,
      finalPromptOverride: override,
    });

    const clientIdx = prompt.indexOf(clientMediaContract);
    const overrideIdx = prompt.indexOf('## Codex built-in imagegen override');
    expect(clientIdx).toBeGreaterThan(-1);
    expect(overrideIdx).toBeGreaterThan(clientIdx);
    expect(prompt.match(/## Codex built-in imagegen override/g)).toHaveLength(1);
  });

  it('resolves only the narrow Codex generated_images allowlist for known gpt-image image projects', () => {
    expect(
      resolveCodexGeneratedImagesDir(
        'codex',
        { kind: 'image', imageModel: 'gpt-image-2' },
        { CODEX_HOME: '/tmp/custom-codex-home' },
        '/home/tester',
      ),
    ).toBe('/tmp/custom-codex-home/generated_images');

    expect(
      resolveCodexGeneratedImagesDir(
        'codex',
        { kind: 'image', imageModel: 'gpt-image-2-preview' },
        { CODEX_HOME: '/tmp/custom-codex-home' },
        '/home/tester',
      ),
    ).toBeNull();

    expect(
      resolveCodexGeneratedImagesDir(
        'claude',
        { kind: 'image', imageModel: 'gpt-image-2' },
        { CODEX_HOME: '/tmp/custom-codex-home' },
        '/home/tester',
      ),
    ).toBeNull();
  });

  it('rejects a generated_images final-component symlink', () => {
    const root = mkdtempSync(join(tmpdir(), 'od-codex-generated-symlink-'));
    try {
      const codexHome = join(root, 'codex-home');
      const symlinkTarget = join(root, 'actual-generated-images');
      mkdirSync(codexHome, { recursive: true });
      mkdirSync(symlinkTarget, { recursive: true });
      symlinkDir(symlinkTarget, join(codexHome, 'generated_images'));

      const generatedImagesDir = resolveCodexGeneratedImagesDir(
        'codex',
        { kind: 'image', imageModel: 'gpt-image-2' },
        { CODEX_HOME: codexHome },
        '/home/tester',
      );

      expect(
        validateCodexGeneratedImagesDir(generatedImagesDir, {
          warn: () => undefined,
        }),
      ).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a generated_images dir whose canonical path is inside a protected root', () => {
    const root = mkdtempSync(join(tmpdir(), 'od-codex-generated-protected-'));
    try {
      const protectedRoot = join(root, 'skills');
      const protectedGeneratedImages = join(protectedRoot, 'generated_images');
      mkdirSync(protectedGeneratedImages, { recursive: true });
      const codexHome = join(root, 'codex-home');
      symlinkDir(protectedRoot, codexHome);

      const generatedImagesDir = resolveCodexGeneratedImagesDir(
        'codex',
        { kind: 'image', imageModel: 'gpt-image-2' },
        { CODEX_HOME: codexHome },
        '/home/tester',
      );

      expect(
        validateCodexGeneratedImagesDir(generatedImagesDir, {
          protectedDirs: [protectedRoot],
          warn: () => undefined,
        }),
      ).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('grants Codex the canonical validated generated_images dir', () => {
    const root = mkdtempSync(join(tmpdir(), 'od-codex-generated-canonical-'));
    try {
      const actualCodexHome = join(root, 'actual-codex-home');
      const symlinkCodexHome = join(root, 'codex-home-link');
      mkdirSync(actualCodexHome, { recursive: true });
      symlinkDir(actualCodexHome, symlinkCodexHome);

      const generatedImagesDir = resolveCodexGeneratedImagesDir(
        'codex',
        { kind: 'image', imageModel: 'gpt-image-2' },
        { CODEX_HOME: symlinkCodexHome },
        '/home/tester',
      );
      const validatedDir = validateCodexGeneratedImagesDir(
        generatedImagesDir,
        { warn: () => undefined },
      );
      const canonicalGeneratedImagesDir = join(
        realpathSync.native(actualCodexHome),
        'generated_images',
      );
      const extraAllowedDirs = resolveChatExtraAllowedDirs({
        agentId: 'codex',
        skillsDir: '/repo/skills',
        designSystemsDir: '/repo/design-systems',
        linkedDirs: ['/linked/reference'],
        codexGeneratedImagesDir: validatedDir,
        existsSync: () => true,
      });
      const codex = getAgentDef('codex');
      if (!codex) throw new Error('Codex agent definition missing');
      const args = codex.buildArgs('', [], extraAllowedDirs, {}, {
        cwd: '/tmp/od-project',
      });

      expect(generatedImagesDir).not.toBe(canonicalGeneratedImagesDir);
      expect(validatedDir).toBe(canonicalGeneratedImagesDir);
      expect(extraAllowedDirs).toEqual([canonicalGeneratedImagesDir]);
      expect(
        args.filter(
          (arg, index) =>
            arg === '--add-dir' || args[index - 1] === '--add-dir',
        ),
      ).toEqual(['--add-dir', canonicalGeneratedImagesDir]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('limits Codex extra allowed dirs to the generated_images output dir', () => {
    const generatedImagesDir = '/home/tester/.codex/generated_images';
    const dirs = resolveChatExtraAllowedDirs({
      agentId: '  CoDeX  ',
      skillsDir: '/repo/skills',
      designSystemsDir: '/repo/design-systems',
      linkedDirs: ['/linked/reference'],
      codexGeneratedImagesDir: generatedImagesDir,
      existsSync: () => true,
    });

    expect(dirs).toEqual([generatedImagesDir]);

    const codex = getAgentDef('codex');
    if (!codex) throw new Error('Codex agent definition missing');
    const args = codex.buildArgs('', [], dirs, {}, { cwd: '/tmp/od-project' });
    expect(
      args.filter(
        (arg, index) =>
          arg === '--add-dir' || args[index - 1] === '--add-dir',
      ),
    ).toEqual(['--add-dir', generatedImagesDir]);
    expect(args).not.toContain('/repo/skills');
    expect(args).not.toContain('/repo/design-systems');
    expect(args).not.toContain('/linked/reference');
  });

  it('keeps resource and linked dirs for non-Codex agents without the Codex output dir', () => {
    const existingDirs = new Set([
      '/repo/skills',
      '/repo/design-systems',
      '/linked/reference',
      '/home/tester/.codex/generated_images',
    ]);
    const dirs = resolveChatExtraAllowedDirs({
      agentId: 'claude',
      skillsDir: '/repo/skills',
      designSystemsDir: '/repo/design-systems',
      linkedDirs: ['/linked/reference'],
      codexGeneratedImagesDir: '/home/tester/.codex/generated_images',
      existsSync: (dir: string) => existingDirs.has(dir),
    });

    expect(dirs).toEqual([
      '/repo/skills',
      '/repo/design-systems',
      '/linked/reference',
    ]);
  });

  it('does not add resource dirs for Codex when imagegen is not whitelisted', () => {
    const dirs = resolveChatExtraAllowedDirs({
      agentId: 'codex',
      skillsDir: '/repo/skills',
      designSystemsDir: '/repo/design-systems',
      linkedDirs: ['/linked/reference'],
      codexGeneratedImagesDir: null,
      existsSync: () => true,
    });

    expect(dirs).toEqual([]);
  });

  it('omits the Codex override when validation fails or the dir is not granted', () => {
    const metadata = { kind: 'image', imageModel: 'gpt-image-2' };
    const root = mkdtempSync(join(tmpdir(), 'od-codex-generated-prompt-'));
    try {
      const codexHome = join(root, 'codex-home');
      const symlinkTarget = join(root, 'actual-generated-images');
      mkdirSync(codexHome, { recursive: true });
      mkdirSync(symlinkTarget, { recursive: true });
      symlinkDir(symlinkTarget, join(codexHome, 'generated_images'));

      const generatedImagesDir = resolveCodexGeneratedImagesDir(
        'codex',
        metadata,
        { CODEX_HOME: codexHome },
        '/home/tester',
      );
      const validatedDir = validateCodexGeneratedImagesDir(
        generatedImagesDir,
        { warn: () => undefined },
      );
      const extraAllowedDirs = resolveChatExtraAllowedDirs({
        agentId: 'codex',
        skillsDir: '/repo/skills',
        designSystemsDir: '/repo/design-systems',
        linkedDirs: ['/linked/reference'],
        codexGeneratedImagesDir: validatedDir,
        existsSync: () => true,
      });
      const validationFailedOverride = resolveGrantedCodexImagegenOverride({
        agentId: 'codex',
        metadata,
        codexGeneratedImagesDir: validatedDir,
        extraAllowedDirs,
      });
      const validationFailedPrompt = composeLiveInstructionPrompt({
        daemonSystemPrompt: 'daemon prompt',
        runtimeToolPrompt: 'runtime tools',
        clientSystemPrompt: 'client media contract',
        finalPromptOverride: validationFailedOverride,
      });

      expect(validatedDir).toBeNull();
      expect(extraAllowedDirs).toEqual([]);
      expect(validationFailedOverride).toBeNull();
      expect(validationFailedPrompt).not.toContain(
        '## Codex built-in imagegen override',
      );

      const validDir = join(root, 'safe-codex-home', 'generated_images');
      mkdirSync(validDir, { recursive: true });
      const notGrantedOverride = resolveGrantedCodexImagegenOverride({
        agentId: 'codex',
        metadata,
        codexGeneratedImagesDir: validDir,
        extraAllowedDirs: [],
      });

      expect(notGrantedOverride).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
