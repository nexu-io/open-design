import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { generateMedia } from '../src/media/index.js';
import { resolveCodexSubscriptionStatus } from '../src/media/config.js';

const liveCodexImagegenEnabled = process.env.OD_LIVE_CODEX_IMAGEGEN === '1';
const liveDescribe = liveCodexImagegenEnabled ? describe : describe.skip;

const OPENAI_ENV_KEYS = [
  'OD_OPENAI_API_KEY',
  'OPENAI_API_KEY',
  'AZURE_API_KEY',
  'AZURE_OPENAI_API_KEY',
];

function looksLikeImage(bytes: Buffer): boolean {
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
  ) {
    return true;
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }
  return (
    bytes.length >= 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

liveDescribe('live Codex subscription imagegen', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const originalAllowStubs = process.env.OD_MEDIA_ALLOW_STUBS;
  const originalOpenAIEnv = Object.fromEntries(
    OPENAI_ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-live-codex-imagegen-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_ALLOW_STUBS;
    for (const key of OPENAI_ENV_KEYS) delete process.env[key];
  });

  afterEach(async () => {
    if (originalAllowStubs == null) {
      delete process.env.OD_MEDIA_ALLOW_STUBS;
    } else {
      process.env.OD_MEDIA_ALLOW_STUBS = originalAllowStubs;
    }
    for (const key of OPENAI_ENV_KEYS) {
      if (originalOpenAIEnv[key] == null) {
        delete process.env[key];
      } else {
        process.env[key] = originalOpenAIEnv[key];
      }
    }
    await rm(root, { recursive: true, force: true });
  });

  it('generates gpt-image-2 through the local Codex subscription path', async () => {
    const subscription = await resolveCodexSubscriptionStatus(projectRoot);
    expect(
      subscription.available,
      'OD_LIVE_CODEX_IMAGEGEN=1 requires a local Codex ChatGPT subscription login',
    ).toBe(true);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'A simple flat blue square icon on a transparent background.',
      output: 'live-codex-subscription.png',
    });

    expect(result.providerId).toBe('codex');
    expect(result.providerNote).toContain('codex/gpt-image-2');
    expect(result.usedStubFallback).toBe(false);
    expect(result.providerError).toBeNull();

    const bytes = await readFile(path.join(projectsRoot, 'project-1', result.name));
    expect(bytes.length).toBeGreaterThan(1024);
    expect(looksLikeImage(bytes)).toBe(true);
  }, 360_000);
});
