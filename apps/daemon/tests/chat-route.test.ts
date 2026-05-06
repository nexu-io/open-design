import type http from 'node:http';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
});

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
