import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runVelaCommandMock } = vi.hoisted(() => ({
  runVelaCommandMock: vi.fn(),
}));

vi.mock('../../src/integrations/vela-command.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/integrations/vela-command.js')>();
  return {
    ...actual,
    runVelaCommand: runVelaCommandMock,
  };
});

import { generateMedia } from '../../src/media/index.js';

const IMAGE_BYTES = Buffer.from('real-image-output');
const VIDEO_BYTES = Buffer.from('real-video-output');

function valueAfter(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1]) throw new Error(`missing ${flag}`);
  return args[index + 1]!;
}

function allValuesAfter(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === flag && args[index + 1]) values.push(args[index + 1]!);
  }
  return values;
}

describe('Vela media provider', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  let projectDir: string;
  let refs: string[];
  let tempOutputDirs: string[];
  const originalAliases = process.env.OD_MEDIA_MODEL_ALIASES;
  const originalStubs = process.env.OD_MEDIA_ALLOW_STUBS;
  const originalPoll = process.env.OD_VELA_VIDEO_POLL_INTERVAL_MS;
  const originalVideoTimeout = process.env.OD_VELA_VIDEO_TIMEOUT_MS;

  beforeEach(async () => {
    runVelaCommandMock.mockReset();
    root = await mkdtemp(path.join(os.tmpdir(), 'od-vela-media-test-'));
    projectRoot = path.join(root, 'repo');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    projectDir = path.join(projectsRoot, 'project-1');
    await mkdir(projectDir, { recursive: true });
    refs = [];
    for (let index = 1; index <= 6; index++) {
      const name = `ref-${index}.png`;
      await writeFile(path.join(projectDir, name), Buffer.from(`image-${index}`));
      refs.push(name);
    }
    tempOutputDirs = [];
    delete process.env.OD_MEDIA_MODEL_ALIASES;
    delete process.env.OD_MEDIA_ALLOW_STUBS;
    process.env.OD_VELA_VIDEO_POLL_INTERVAL_MS = '1';
    process.env.OD_VELA_VIDEO_TIMEOUT_MS = '1000';
  });

  afterEach(async () => {
    if (originalAliases == null) delete process.env.OD_MEDIA_MODEL_ALIASES;
    else process.env.OD_MEDIA_MODEL_ALIASES = originalAliases;
    if (originalStubs == null) delete process.env.OD_MEDIA_ALLOW_STUBS;
    else process.env.OD_MEDIA_ALLOW_STUBS = originalStubs;
    if (originalPoll == null) delete process.env.OD_VELA_VIDEO_POLL_INTERVAL_MS;
    else process.env.OD_VELA_VIDEO_POLL_INTERVAL_MS = originalPoll;
    if (originalVideoTimeout == null) delete process.env.OD_VELA_VIDEO_TIMEOUT_MS;
    else process.env.OD_VELA_VIDEO_TIMEOUT_MS = originalVideoTimeout;
    await rm(root, { recursive: true, force: true });
  });

  function baseArgs() {
    return {
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      prompt: 'A precise test prompt',
    };
  }

  // Mirrors what `vela media models --json` publishes for these models: one
  // aspect ratio can carry several resolutions, and `default` marks the tier an
  // unqualified request would have used.
  function publishedModels() {
    const profile = (aspectRatio: string, resolution: string) => ({
      aspect_ratio: aspectRatio,
      resolution,
    });
    const envelope = (profiles: Array<{ aspect_ratio: string; resolution: string }>, resolution: string) => ({
      profiles,
      default: { aspect_ratio: '1:1', resolution },
    });
    const gptImage2 = envelope(
      [profile('1:1', '1K'), profile('1:1', '2K'), profile('16:9', '2K')],
      '2K',
    );
    // Quality is published per model, not per request kind, and only some
    // models are tiered at all -- gpt-image-2 is, the rest are not.
    const quality = { default: 'low', values: ['high', 'low', 'medium'] };
    return {
      models: [
        // The alias test renders vela/gpt-image-2 under a tenant wire name, and
        // the catalogue is keyed by the wire name the request actually carries.
        { model: 'tenant-image-model', kind: 'image', capabilities: { profiles: { generations: gptImage2 } } },
        {
          model: 'gpt-image-2',
          kind: 'image',
          capabilities: { quality, profiles: { generations: gptImage2, edits: gptImage2 } },
        },
        {
          model: 'nano-banana-2',
          kind: 'image',
          capabilities: {
            profiles: {
              // 16:9 exists at both tiers; the default tier must win.
              edits: envelope(
                [profile('1:1', '2K'), profile('16:9', '1K'), profile('16:9', '2K')],
                '2K',
              ),
            },
          },
        },
        {
          model: 'seedream-5.0-pro',
          kind: 'image',
          capabilities: {
            profiles: {
              generations: envelope([profile('1:1', '2K'), profile('9:16', '2K')], '2K'),
            },
          },
        },
      ],
    };
  }

  // The profile lookup precedes the render, so index-based lookups would drift.
  function imageCall() {
    const call = runVelaCommandMock.mock.calls.find(([args]) => args[0] === 'image');
    if (!call) throw new Error('expected an image command to be spawned');
    return call;
  }

  // Every image render now asks for the published profiles first, so a test
  // that only stubs the render would have its catalogue lookup fall into that
  // stub and fail on a missing --output.
  function mockVelaCommand(handler: (args: string[]) => Promise<string>) {
    runVelaCommandMock.mockImplementation(async (args: string[]) => {
      if (args[0] === 'media' && args[1] === 'models') {
        return JSON.stringify(publishedModels());
      }
      return handler(args);
    });
  }

  function mockReadyImage(mime = 'image/webp') {
    mockVelaCommand(async (args: string[]) => {
      const output = valueAfter(args, '--output');
      tempOutputDirs.push(path.dirname(output));
      await writeFile(output, IMAGE_BYTES);
      return JSON.stringify({
        asset_id: 'ma_test',
        status: 'ready',
        kind: 'image',
        mime_type: mime,
      });
    });
  }

  it('maps vela catalogue id to image gen, preserves aliasing, and injects trusted workspace env', async () => {
    process.env.OD_MEDIA_MODEL_ALIASES = JSON.stringify({
      'vela/gpt-image-2': 'tenant-image-model',
    });
    mockReadyImage();

    const result = await generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/gpt-image-2',
      output: 'poster.png',
      aspect: '1:1',
      workspaceId: 'workspace-team',
    });

    expect(result.providerId).toBe('vela');
    expect(result.usedStubFallback).toBe(false);
    expect(result.name).toBe('poster.webp');
    expect(result.providerNote).toContain('vela/tenant-image-model');
    const [args, options] = imageCall();
    expect(args.slice(0, 2)).toEqual(['image', 'gen']);
    expect(valueAfter(args, '--model')).toBe('tenant-image-model');
    expect(args).not.toContain('--size');
    // 1:1 is published at 1K and 2K; the model's default tier decides.
    expect(valueAfter(args, '--aspect-ratio')).toBe('1:1');
    expect(valueAfter(args, '--resolution')).toBe('2K');
    expect(result.providerNote).toContain('1:1 2K');
    expect(options.timeoutMs).toBe(330_000);
    expect(options.configuredEnv).toEqual({
      VELA_INVOCATION_SOURCE: 'open-design',
      VELA_WORKSPACE_ID: 'workspace-team',
    });
    await expect(stat(tempOutputDirs[0]!)).rejects.toThrow();
  });

  it('routes the removed Codex image model id through Vela for existing projects', async () => {
    mockReadyImage();

    const result = await generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'codex-gpt-image-2',
      output: 'legacy-project.png',
      aspect: '1:1',
    });

    expect(result.providerId).toBe('vela');
    expect(valueAfter(imageCall()[0], '--model')).toBe('gpt-image-2');
  });

  it('uses image edit with five absolute, independently repeated --image values', async () => {
    mockReadyImage('image/png');

    await generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/nano-banana-2',
      images: refs.slice(0, 5),
      output: 'edited.png',
    });

    const [args, options] = imageCall();
    expect(args.slice(0, 2)).toEqual(['image', 'edit']);
    expect(valueAfter(args, '--model')).toBe('nano-banana-2');
    // Edits carry their own published envelope, distinct from generations.
    expect(valueAfter(args, '--aspect-ratio')).toBe('1:1');
    expect(valueAfter(args, '--resolution')).toBe('2K');
    const inputPaths = allValuesAfter(args, '--image');
    expect(inputPaths).toHaveLength(5);
    expect(inputPaths.every((inputPath) => !inputPath.startsWith(projectDir))).toBe(true);
    expect(new Set(inputPaths.map((inputPath) => path.dirname(inputPath)))).toHaveLength(1);
    expect(options.configuredEnv).toEqual({
      VELA_INVOCATION_SOURCE: 'open-design',
    });
  });

  it.each(['nano-banana', 'nano-banana-2'])(
    'routes the unqualified %s alias through the Vela image editor',
    async (model) => {
      mockReadyImage('image/png');

      await generateMedia({
        ...baseArgs(),
        surface: 'image',
        model,
        image: refs[0]!,
        aspect: '16:9',
        output: 'aliased-edit.png',
      });

      const [args] = imageCall();
      expect(args.slice(0, 2)).toEqual(['image', 'edit']);
      expect(valueAfter(args, '--model')).toBe('nano-banana-2');
      expect(valueAfter(args, '--aspect-ratio')).toBe('16:9');
      expect(valueAfter(args, '--resolution')).toBe('2K');
    },
  );

  it('protects the project reference image when the CLI resizes its input in place', async () => {
    const sourcePath = path.join(projectDir, refs[0]!);
    const original = await readFile(sourcePath);
    mockVelaCommand(async (args: string[]) => {
      const cliInputPath = valueAfter(args, '--image');
      expect(cliInputPath).not.toBe(sourcePath);
      await writeFile(cliInputPath, Buffer.from('cli-resized-copy'));
      const output = valueAfter(args, '--output');
      tempOutputDirs.push(path.dirname(output));
      await writeFile(output, IMAGE_BYTES);
      return JSON.stringify({
        asset_id: 'ma_copy',
        status: 'ready',
        kind: 'image',
        mime_type: 'image/png',
      });
    });

    await generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/nano-banana-2',
      image: refs[0]!,
      output: 'copy-safe.png',
    });

    expect(await readFile(sourcePath)).toEqual(original);
  });

  it('rejects six images before spawning Vela', async () => {
    await expect(generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/seedream-5.0',
      images: refs,
      output: 'too-many.png',
    })).rejects.toThrow('at most 5 input images');
    expect(runVelaCommandMock).not.toHaveBeenCalled();
  });

  it('requests a published non-default aspect ratio instead of the provider default', async () => {
    mockReadyImage();

    const result = await generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/gpt-image-2',
      aspect: '16:9',
      output: 'wide.png',
    });

    const [args] = imageCall();
    expect(valueAfter(args, '--aspect-ratio')).toBe('16:9');
    expect(valueAfter(args, '--resolution')).toBe('2K');
    expect(result.providerNote).toContain('16:9 2K');
  });

  it('prefers the default resolution when one aspect ratio publishes several', async () => {
    mockReadyImage();

    await generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/nano-banana-2',
      images: refs.slice(0, 1),
      aspect: '16:9',
      output: 'wide-edit.png',
    });

    const [args] = imageCall();
    expect(valueAfter(args, '--aspect-ratio')).toBe('16:9');
    expect(valueAfter(args, '--resolution')).toBe('2K');
  });

  // Tiers are priced apart by more than an order of magnitude, so what an
  // unqualified request sends is a billing decision, not a formatting one.
  it('sends no quality tier when the caller asked for none, leaving the model default in charge', async () => {
    mockReadyImage();

    const result = await generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/gpt-image-2',
      aspect: '1:1',
      output: 'unqualified.png',
    });

    const [args] = imageCall();
    expect(args).not.toContain('--quality');
    expect(result.providerNote).toContain('model default quality');
  });

  it('forwards a published quality tier verbatim', async () => {
    mockReadyImage();

    const result = await generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/gpt-image-2',
      images: refs.slice(0, 1),
      aspect: '1:1',
      quality: 'high',
      output: 'high-tier.png',
    });

    const [args] = imageCall();
    expect(valueAfter(args, '--quality')).toBe('high');
    expect(result.providerNote).toContain('high');
  });

  it('names the published tiers when the requested one is not one of them', async () => {
    mockReadyImage();

    await expect(generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/gpt-image-2',
      aspect: '1:1',
      quality: 'ultra',
      output: 'wrong-tier.png',
    })).rejects.toThrow('does not publish quality ultra; supported: high, low, medium');
    expect(runVelaCommandMock.mock.calls.every(([args]) => args[0] !== 'image')).toBe(true);
  });

  // Both the CLI and the server reject a tier on an untiered model, so failing
  // here keeps the round trip -- and its error message -- off the wire.
  it('refuses a quality tier on a model that publishes no quality capability', async () => {
    mockReadyImage();

    await expect(generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/nano-banana-2',
      images: refs.slice(0, 1),
      aspect: '1:1',
      quality: 'high',
      output: 'untiered.png',
    })).rejects.toThrow('does not publish a quality capability');
    expect(runVelaCommandMock.mock.calls.every(([args]) => args[0] !== 'image')).toBe(true);
  });

  it('requests an explicitly named resolution instead of the model default', async () => {
    mockReadyImage();

    const result = await generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/gpt-image-2',
      aspect: '1:1',
      resolution: '1K',
      output: 'small.png',
    });

    const [args] = imageCall();
    expect(valueAfter(args, '--aspect-ratio')).toBe('1:1');
    expect(valueAfter(args, '--resolution')).toBe('1K');
    expect(result.providerNote).toContain('1:1 1K');
  });

  // An agent that writes "2k" means Vela's "2K". Rejecting on case alone cost
  // a real run one failed request plus a retry before it shifted the letter.
  it('accepts a published resolution or tier in any case and sends the published spelling', async () => {
    mockReadyImage();

    const result = await generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/gpt-image-2',
      aspect: '1:1',
      resolution: '1k',
      quality: 'HIGH',
      output: 'case-insensitive.png',
    });

    const [args] = imageCall();
    expect(valueAfter(args, '--resolution')).toBe('1K');
    expect(valueAfter(args, '--quality')).toBe('high');
    expect(result.providerNote).toContain('1:1 1K');
  });

  it('names the resolutions published at that aspect when the requested one is not one of them', async () => {
    mockReadyImage();

    await expect(generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/gpt-image-2',
      aspect: '16:9',
      resolution: '1K',
      output: 'wrong-resolution.png',
    })).rejects.toThrow('does not publish resolution 1K at aspect 16:9; supported: 2K');
    expect(runVelaCommandMock.mock.calls.every(([args]) => args[0] !== 'image')).toBe(true);
  });

  it('names the published aspect ratios when the requested one is not one of them', async () => {
    mockReadyImage();

    await expect(generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/seedream-5.0-pro',
      aspect: '16:9',
      output: 'wrong-aspect.png',
    })).rejects.toThrow('does not publish aspect 16:9; supported: 1:1, 9:16');
    expect(runVelaCommandMock.mock.calls.every(([args]) => args[0] !== 'image')).toBe(true);
  });

  it.each([
    [
      'invalid JSON',
      async (args: string[]) => {
        tempOutputDirs.push(path.dirname(valueAfter(args, '--output')));
        return 'not-json';
      },
      'invalid JSON',
    ],
    [
      'non-ready asset',
      async (args: string[]) => {
        const output = valueAfter(args, '--output');
        tempOutputDirs.push(path.dirname(output));
        await writeFile(output, IMAGE_BYTES);
        return JSON.stringify({ asset_id: 'ma_wait', status: 'processing', kind: 'image', mime_type: 'image/png' });
      },
      'non-ready asset status processing',
    ],
    [
      'missing output',
      async (args: string[]) => {
        tempOutputDirs.push(path.dirname(valueAfter(args, '--output')));
        return JSON.stringify({ asset_id: 'ma_missing', status: 'ready', kind: 'image', mime_type: 'image/png' });
      },
      'did not write the requested output file',
    ],
    [
      'empty output',
      async (args: string[]) => {
        const output = valueAfter(args, '--output');
        tempOutputDirs.push(path.dirname(output));
        await writeFile(output, Buffer.alloc(0));
        return JSON.stringify({ asset_id: 'ma_empty', status: 'ready', kind: 'image', mime_type: 'image/png' });
      },
      'wrote an empty output file',
    ],
  ])('fails on %s and cleans the daemon temp directory', async (_name, implementation, message) => {
    mockVelaCommand(implementation);
    await expect(generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/gpt-image-2',
      output: 'broken.png',
    })).rejects.toThrow(message);
    if (tempOutputDirs[0]) {
      await expect(stat(tempOutputDirs[0])).rejects.toThrow();
    }
  });

  it('never turns a Vela failure into a stub, even when stubs are enabled', async () => {
    process.env.OD_MEDIA_ALLOW_STUBS = '1';
    mockVelaCommand(async (args: string[]) => {
      tempOutputDirs.push(path.dirname(valueAfter(args, '--output')));
      throw new Error('workspace billing denied');
    });

    await expect(generateMedia({
      ...baseArgs(),
      surface: 'image',
      model: 'vela/gpt-image-2',
      output: 'must-not-exist.png',
    })).rejects.toThrow('workspace billing denied');
    await expect(stat(path.join(projectDir, 'must-not-exist.png'))).rejects.toThrow();
    await expect(stat(tempOutputDirs[0]!)).rejects.toThrow();
  });

  it('submits and polls video with first-frame/references, progress heartbeats, and one terminal download', async () => {
    const progress: string[] = [];
    runVelaCommandMock.mockImplementation(async (args: string[]) => {
      if (args[0] === 'video' && args[1] === 'gen') {
        return JSON.stringify({ task_id: 'mt_test', status: 'queued' });
      }
      const output = valueAfter(args, '--output');
      tempOutputDirs.push(path.dirname(output));
      const pollIndex = runVelaCommandMock.mock.calls.filter(
        ([callArgs]) => callArgs[0] === 'video' && callArgs[1] === 'get',
      ).length;
      if (pollIndex === 1) {
        return JSON.stringify({ task_id: 'mt_test', status: 'running', progress: 0.5 });
      }
      await writeFile(output, VIDEO_BYTES);
      return JSON.stringify({ task_id: 'mt_test', status: 'succeeded' });
    });

    const result = await generateMedia({
      ...baseArgs(),
      surface: 'video',
      model: 'vela/doubao-seedance-2-0-260128',
      aspect: '9:16',
      length: 10,
      images: refs.slice(0, 5),
      output: 'clip.mov',
      onProgress: (line) => progress.push(line),
      workspaceId: 'workspace-video',
    });

    expect(result.providerId).toBe('vela');
    expect(result.name).toBe('clip.mp4');
    expect(result.providerNote).not.toContain('mt_test');
    const submit = runVelaCommandMock.mock.calls[0]![0] as string[];
    expect(submit.slice(0, 2)).toEqual(['video', 'gen']);
    expect(submit).toContain('--no-wait');
    expect(submit).not.toContain('--wait');
    expect(submit).not.toContain('--output');
    expect(valueAfter(submit, '--model')).toBe('doubao-seedance-2-0-260128');
    expect(valueAfter(submit, '--ratio')).toBe('9:16');
    expect(valueAfter(submit, '--duration')).toBe('10');
    const firstFrame = valueAfter(submit, '--first-frame');
    const referencePaths = allValuesAfter(submit, '--ref');
    expect(firstFrame).not.toBe(path.join(projectDir, refs[0]!));
    expect(referencePaths).toHaveLength(4);
    expect(new Set([firstFrame, ...referencePaths].map((inputPath) => path.dirname(inputPath))))
      .toHaveLength(1);
    expect(valueAfter(submit, '--resolution')).toBe('720p');
    expect(submit).not.toContain('--generate-audio');

    const polls = runVelaCommandMock.mock.calls.slice(1).map(([args]) => args as string[]);
    expect(polls).toHaveLength(2);
    for (const poll of polls) {
      expect(poll.slice(0, 3)).toEqual(['video', 'get', 'mt_test']);
      expect(poll).toContain('--output');
      expect(poll).toContain('--json');
      expect(poll).not.toContain('--wait');
    }
    expect(progress[0]).toContain('accepted');
    expect(progress.some((line) => line.includes('status running'))).toBe(true);
    expect(progress.some((line) => line.includes('status succeeded'))).toBe(true);
    await expect(stat(tempOutputDirs.at(-1)!)).rejects.toThrow();
  });

  it('preserves a failed video status and provider error', async () => {
    runVelaCommandMock
      .mockResolvedValueOnce(JSON.stringify({ task_id: 'mt_failed', status: 'queued' }))
      .mockResolvedValueOnce(JSON.stringify({
        task_id: 'mt_failed',
        status: 'failed',
        error: { code: 'provider_rejected', message: 'unsafe reference' },
      }));

    await expect(generateMedia({
      ...baseArgs(),
      surface: 'video',
      model: 'vela/doubao-seedance-2-0-260128',
      length: 5,
      output: 'failed.mp4',
    })).rejects.toThrow(/status failed.*provider_rejected.*unsafe reference/);
  });

  it('times out with the last video status and cleans temporary output', async () => {
    process.env.OD_VELA_VIDEO_TIMEOUT_MS = '3';
    runVelaCommandMock
      .mockResolvedValueOnce(JSON.stringify({ task_id: 'mt_slow', status: 'queued' }))
      .mockImplementation(async (args: string[]) => {
        tempOutputDirs.push(path.dirname(valueAfter(args, '--output')));
        return JSON.stringify({ task_id: 'mt_slow', status: 'running' });
      });

    await expect(generateMedia({
      ...baseArgs(),
      surface: 'video',
      model: 'vela/doubao-seedance-2-0-260128',
      output: 'slow.mp4',
    })).rejects.toThrow(/timed out.*last status (queued|running)/);
    if (tempOutputDirs[0]) {
      await expect(stat(tempOutputDirs[0])).rejects.toThrow();
    }
  });

  it.each([
    ['4:3', 5, 'only supports aspect ratios'],
    ['16:9', 6, 'only supports durations of 5 or 10'],
    ['16:9', 8, 'only supports durations of 5 or 10'],
  ])('rejects unsupported video capability %s/%ss before spawning', async (aspect, length, message) => {
    await expect(generateMedia({
      ...baseArgs(),
      surface: 'video',
      model: 'vela/doubao-seedance-2-0-260128',
      aspect,
      length,
      output: 'unsupported.mp4',
    })).rejects.toThrow(message);
    expect(runVelaCommandMock).not.toHaveBeenCalled();
  });
});
