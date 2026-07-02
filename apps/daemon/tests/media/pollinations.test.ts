import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../../src/media/index.js';

// 1x1 transparent PNG.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';

describe('pollinations media generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;
  const originalKey = process.env.OD_POLLINATIONS_API_KEY;
  const originalKeyAlt = process.env.POLLINATIONS_API_KEY;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-pollinations-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_POLLINATIONS_API_KEY;
    delete process.env.POLLINATIONS_API_KEY;
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    const restore = (name: string, value: string | undefined) => {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    };
    restore('OD_MEDIA_CONFIG_DIR', originalMediaConfigDir);
    restore('OD_DATA_DIR', originalDataDir);
    restore('OD_POLLINATIONS_API_KEY', originalKey);
    restore('POLLINATIONS_API_KEY', originalKeyAlt);
    await rm(root, { recursive: true, force: true });
  });

  it('renders an image with no key on the 16:9 aspect', async () => {
    let calledUrl = '';
    let sentAuth: unknown;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      calledUrl = String(input);
      sentAuth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return new Response(Buffer.from(PNG_BASE64, 'base64'), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'pollinations-flux',
      prompt: 'A calm landscape, minimal photography',
      aspect: '16:9',
      output: 'poll.png',
    });

    expect(calledUrl.startsWith('https://image.pollinations.ai/prompt/')).toBe(true);
    expect(calledUrl).toContain('width=1280');
    expect(calledUrl).toContain('height=720');
    expect(calledUrl).toContain('model=flux');
    // Free anonymous tier: no Authorization header when no key is configured.
    expect(sentAuth).toBeUndefined();

    expect(result.providerId).toBe('pollinations');
    expect(result.providerNote).toContain('pollinations/flux');
    expect(result.providerNote).toContain('1280x720');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'poll.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('rejects a zero-byte 200 response instead of writing an empty file', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array(0), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'pollinations-flux',
      prompt: 'A calm landscape, minimal photography',
      aspect: '16:9',
      output: 'empty.jpg',
    })).rejects.toThrow(/pollinations .*empty image response/i);

    // It should have retried once before giving up (two attempts total).
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // No zero-byte artifact should have been persisted.
    await expect(readFile(path.join(projectsRoot, 'project-1', 'empty.jpg')))
      .rejects.toThrow();
  });

  it('sends an Authorization Bearer header when an optional key is configured', async () => {
    process.env.OD_POLLINATIONS_API_KEY = 'pk-test-key';
    let sentAuth: unknown;
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      sentAuth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return new Response(Buffer.from(PNG_BASE64, 'base64'), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'pollinations-flux',
      prompt: 'A calm landscape, minimal photography',
      aspect: '1:1',
      output: 'keyed.png',
    });

    expect(sentAuth).toBe('Bearer pk-test-key');
  });
});
