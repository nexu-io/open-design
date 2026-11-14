// FLUX 3 Image via the integrated fal.ai provider (#9444).
//
// fal publishes Black Forest Labs' FLUX 3 under a partner namespace
// (`blackforestlabs/flux-3/text-to-image`) rather than `fal-ai/*`, and its
// input schema is not the legacy FLUX 1.x shape: it takes `resolution` +
// `aspect_ratio` and has no `num_images` / `image_size` fields. These specs
// drive the fal queue entirely through a mocked `fetch` — no fal key, no
// billed generation.

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../../src/media/index.js';
import { isFalCustomModelPath } from '../../src/media/models.js';

const FLUX3_T2I = 'blackforestlabs/flux-3/text-to-image';
const QUEUE = 'https://queue.fal.run';
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=',
  'base64',
);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

type QueueCall = { url: string; init?: RequestInit | undefined };

/**
 * Minimal fal queue double: submit → one status poll → result → CDN
 * download. Records every call so specs can assert the wire contract.
 */
function mockFalQueue(endpoint: string, opts: {
  status?: Record<string, unknown>;
  result?: Record<string, unknown>;
  imageBytes?: Buffer;
} = {}) {
  const calls: QueueCall[] = [];
  const statusUrl = `${QUEUE}/${endpoint}/requests/req-123/status`;
  const responseUrl = `${QUEUE}/${endpoint}/requests/req-123`;
  const cdnUrl = 'https://v3.fal.media/files/flux3/out.png';
  const json = (data: unknown) =>
    new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === `${QUEUE}/${endpoint}`) {
      return json({ request_id: 'req-123', status_url: statusUrl, response_url: responseUrl });
    }
    if (url === statusUrl) return json(opts.status ?? { status: 'COMPLETED' });
    if (url === responseUrl) {
      return json(opts.result ?? { images: [{ url: cdnUrl, content_type: 'image/png' }] });
    }
    if (url === cdnUrl) return new Response(opts.imageBytes ?? PNG_BYTES, { status: 200 });
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

function submittedBody(calls: QueueCall[]): Record<string, unknown> {
  const submit = calls[0];
  expect(submit?.init?.method).toBe('POST');
  return JSON.parse(String(submit?.init?.body));
}

describe('fal FLUX 3 text-to-image', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const saved = {
    OD_FAL_KEY: process.env.OD_FAL_KEY,
    FAL_KEY: process.env.FAL_KEY,
    OD_MEDIA_CONFIG_DIR: process.env.OD_MEDIA_CONFIG_DIR,
    OD_DATA_DIR: process.env.OD_DATA_DIR,
    OD_MEDIA_ALLOW_STUBS: process.env.OD_MEDIA_ALLOW_STUBS,
  };

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-fal-flux3-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.FAL_KEY;
    // Real provider errors must surface, not be masked by a stub file.
    delete process.env.OD_MEDIA_ALLOW_STUBS;
    process.env.OD_FAL_KEY = 'fal-test-key';
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    globalThis.fetch = realFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  });

  function generate(overrides: Partial<Parameters<typeof generateMedia>[0]> = {}) {
    return generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: FLUX3_T2I,
      prompt: 'A red fox leaping over a stream',
      output: 'fox.png',
      ...overrides,
    });
  }

  it('routes the exact FLUX 3 endpoint to the fal queue with the FLUX 3 schema', async () => {
    const { calls } = mockFalQueue(FLUX3_T2I);

    const result = await generate({ aspect: '16:9' });

    expect(calls[0]?.url).toBe(`${QUEUE}/${FLUX3_T2I}`);
    expect(calls[0]?.init?.headers).toMatchObject({ authorization: 'Key fal-test-key' });
    // Exact body: FLUX 3 rejects/ignores the legacy FLUX 1.x knobs, so the
    // mapping must not leak `num_images`, `image_size`, or `image_url`.
    expect(submittedBody(calls)).toEqual({
      prompt: 'A red fox leaping over a stream',
      aspect_ratio: '16:9',
      resolution: '1k',
    });
    expect(result.providerId).toBe('fal');
    expect(result.intentionalStub).toBe(false);
    expect(result.usedStubFallback).toBe(false);
    expect(result.providerNote).toBe(`fal/${FLUX3_T2I} · 16:9 · 1k · ${PNG_BYTES.length} bytes`);
    const written = await readFile(path.join(projectsRoot, 'project-1', result.name));
    expect(written.equals(PNG_BYTES)).toBe(true);
  });

  it('defaults the aspect ratio to 1:1 when none is requested', async () => {
    const { calls } = mockFalQueue(FLUX3_T2I);

    await generate();

    expect(submittedBody(calls)).toMatchObject({ aspect_ratio: '1:1', resolution: '1k' });
  });

  it('names the file after the bytes fal actually returned (jpeg default)', async () => {
    mockFalQueue(FLUX3_T2I, {
      result: { images: [{ url: 'https://v3.fal.media/files/flux3/out.png', content_type: 'image/jpeg' }] },
      imageBytes: JPEG_BYTES,
    });

    const result = await generate();

    expect(result.name).toBe('fox.jpg');
    expect(result.mime).toBe('image/jpeg');
  });

  it('surfaces a FAILED queue status as a provider error', async () => {
    mockFalQueue(FLUX3_T2I, { status: { status: 'FAILED', error: { message: 'content policy' } } });

    await expect(generate()).rejects.toThrow('fal task failed: content policy');
  });

  it('rejects a reference image because text-to-image has no image input', async () => {
    const { fetchMock } = mockFalQueue(FLUX3_T2I);
    const dir = path.join(projectsRoot, 'project-1');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'ref.png'), PNG_BYTES);

    await expect(generate({ image: 'ref.png' })).rejects.toThrow(/does not accept a reference image/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects the FLUX 3 text-to-image endpoint on the video surface', async () => {
    const { fetchMock } = mockFalQueue(FLUX3_T2I);

    await expect(generate({ surface: 'video', output: 'fox.mp4' })).rejects.toThrow(/image-only/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the legacy FLUX 1.x mapping for fal-ai/* endpoints', async () => {
    const { calls } = mockFalQueue('fal-ai/flux/dev');

    await generate({ model: 'flux-dev-fal', aspect: '16:9' });

    expect(submittedBody(calls)).toEqual({
      prompt: 'A red fox leaping over a stream',
      num_images: 1,
      image_size: 'landscape_16_9',
    });
  });
});

describe('isFalCustomModelPath', () => {
  it('accepts fal-ai/* paths and the exact FLUX 3 text-to-image endpoint', () => {
    expect(isFalCustomModelPath('fal-ai/flux/dev')).toBe(true);
    expect(isFalCustomModelPath(FLUX3_T2I)).toBe(true);
  });

  it('rejects other blackforestlabs paths, near misses, and host URLs', () => {
    for (const id of [
      'blackforestlabs/flux-3/edit-image',
      'blackforestlabs/flux-3',
      `${FLUX3_T2I}/`,
      `${FLUX3_T2I}/../../x`,
      `BLACKFORESTLABS/flux-3/text-to-image`,
      `https://queue.fal.run/${FLUX3_T2I}`,
      'blackforestlabs/flux-pro',
    ]) {
      expect(isFalCustomModelPath(id), id).toBe(false);
    }
  });
});
