import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';
const IMAGE_BYTES = Buffer.from(PNG_BASE64, 'base64');
const TEST_POLLING_URL = 'https://api.bfl.ai/v1/get_result?id=task-123';
const TEST_IMAGE_URL = 'https://delivery.bfl.ai/results/task-123.png';

const ASPECT_DIMS: ReadonlyArray<readonly [string, number, number]> = [
  ['1:1', 1024, 1024],
  ['16:9', 1440, 816],
  ['9:16', 816, 1440],
  ['4:3', 1184, 880],
  ['3:4', 880, 1184],
  ['3:2', 1248, 832],
  ['2:3', 832, 1248],
  ['21:9', 1568, 672],
];

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function bytesResponse(bytes: Buffer, status = 200): Response {
  const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return new Response(view, {
    status,
    headers: { 'content-type': 'image/png' },
  });
}

function readyOnceAfterPending(seed?: number): FetchMock {
  let pollCount = 0;
  return vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url === 'https://api.bfl.ai/v1/flux-2-max') {
      return jsonResponse({ id: 'task-123', polling_url: TEST_POLLING_URL });
    }
    if (url === TEST_POLLING_URL) {
      pollCount += 1;
      if (pollCount === 1) {
        return jsonResponse({ status: 'Pending' });
      }
      const result: Record<string, unknown> = { sample: TEST_IMAGE_URL };
      if (typeof seed === 'number') {
        result.seed = seed;
      }
      return jsonResponse({ status: 'Ready', result });
    }
    if (url === TEST_IMAGE_URL) {
      return bytesResponse(IMAGE_BYTES);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe('renderBFLImage', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const realSetTimeout = globalThis.setTimeout;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;
  const originalBflApiKey = process.env.BFL_API_KEY;
  const originalOdBflApiKey = process.env.OD_BFL_API_KEY;
  const originalMaxPoll = process.env.OD_BFL_IMAGE_MAX_POLL_MS;
  let setTimeoutSpy: { mockRestore: () => void } | null = null;

  function installFastSetTimeout() {
    const fastSetTimeout = ((handler: (...args: unknown[]) => void, _ms?: number, ...rest: unknown[]) => {
      return realSetTimeout(handler, 0, ...rest);
    }) as unknown as typeof globalThis.setTimeout;
    setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(fastSetTimeout as never);
  }

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-bfl-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_BFL_API_KEY;
    delete process.env.OD_BFL_IMAGE_MAX_POLL_MS;
    process.env.BFL_API_KEY = 'bfl-test-key';
    installFastSetTimeout();
  });

  afterEach(async () => {
    if (setTimeoutSpy) {
      setTimeoutSpy.mockRestore();
      setTimeoutSpy = null;
    }
    vi.useRealTimers();
    globalThis.fetch = realFetch;
    if (originalBflApiKey == null) {
      delete process.env.BFL_API_KEY;
    } else {
      process.env.BFL_API_KEY = originalBflApiKey;
    }
    if (originalOdBflApiKey == null) {
      delete process.env.OD_BFL_API_KEY;
    } else {
      process.env.OD_BFL_API_KEY = originalOdBflApiKey;
    }
    if (originalMaxPoll == null) {
      delete process.env.OD_BFL_IMAGE_MAX_POLL_MS;
    } else {
      process.env.OD_BFL_IMAGE_MAX_POLL_MS = originalMaxPoll;
    }
    if (originalMediaConfigDir == null) {
      delete process.env.OD_MEDIA_CONFIG_DIR;
    } else {
      process.env.OD_MEDIA_CONFIG_DIR = originalMediaConfigDir;
    }
    if (originalDataDir == null) {
      delete process.env.OD_DATA_DIR;
    } else {
      process.env.OD_DATA_DIR = originalDataDir;
    }
    await rm(root, { recursive: true, force: true });
  });

  for (const [aspect, width, height] of ASPECT_DIMS) {
    it(`submits width=${width} height=${height} for aspect ${aspect} without aspect_ratio`, async () => {
      const submitBodies: unknown[] = [];
      const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url === 'https://api.bfl.ai/v1/flux-2-max') {
          submitBodies.push(JSON.parse(String(init?.body)));
          return jsonResponse({ id: 'task-aspect', polling_url: TEST_POLLING_URL });
        }
        if (url === TEST_POLLING_URL) {
          return jsonResponse({ status: 'Ready', result: { sample: TEST_IMAGE_URL } });
        }
        if (url === TEST_IMAGE_URL) {
          return bytesResponse(IMAGE_BYTES);
        }
        throw new Error(`unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      await generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'image',
        model: 'flux-2-max',
        prompt: 'a teapot',
        aspect,
        output: `out-${aspect.replace(':', '-')}.png`,
      });

      expect(submitBodies).toHaveLength(1);
      const body = submitBodies[0] as Record<string, unknown>;
      expect(body).toMatchObject({
        prompt: 'a teapot',
        width,
        height,
      });
      expect(body).not.toHaveProperty('aspect_ratio');
    });
  }

  it('sends the API key via x-key header, not Authorization Bearer', async () => {
    const submitHeaders: Record<string, string>[] = [];
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.bfl.ai/v1/flux-2-max') {
        submitHeaders.push((init?.headers ?? {}) as Record<string, string>);
        return jsonResponse({ id: 'task-h', polling_url: TEST_POLLING_URL });
      }
      if (url === TEST_POLLING_URL) {
        return jsonResponse({ status: 'Ready', result: { sample: TEST_IMAGE_URL } });
      }
      if (url === TEST_IMAGE_URL) {
        return bytesResponse(IMAGE_BYTES);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'flux-2-max',
      prompt: 'an apple',
      aspect: '1:1',
      output: 'header.png',
    });

    expect(submitHeaders).toHaveLength(1);
    const headers = submitHeaders[0]!;
    expect(headers).toMatchObject({
      'x-key': 'bfl-test-key',
      'content-type': 'application/json',
    });
    expect(headers).not.toHaveProperty('authorization');
    expect(headers).not.toHaveProperty('Authorization');
  });

  it('polls until Ready, downloads the image, and returns matching bytes plus a providerNote', async () => {
    vi.stubGlobal('fetch', readyOnceAfterPending());

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'flux-2-max',
      prompt: 'a lighthouse',
      aspect: '1:1',
      output: 'ready.png',
    });

    expect(result.providerId).toBe('bfl');
    expect(result.providerNote).toMatch(/^bfl\/flux-2-max · \d+x\d+/);
    expect(result.providerNote).toContain('1024x1024');

    const onDisk = await readFile(path.join(projectsRoot, 'project-1', 'ready.png'));
    expect(onDisk.equals(IMAGE_BYTES)).toBe(true);
  });

  it('includes seed=<n> in providerNote when the Ready response carries result.seed', async () => {
    vi.stubGlobal('fetch', readyOnceAfterPending(42));

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'flux-2-max',
      prompt: 'a bicycle',
      aspect: '1:1',
      output: 'seeded.png',
    });

    expect(result.providerNote).toContain('seed=42');
  });

  it('throws containing "bfl submit 500" when the submit endpoint returns HTTP 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://api.bfl.ai/v1/flux-2-max') {
        return new Response('upstream boom', { status: 500 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'flux-2-max',
      prompt: 'p',
      aspect: '1:1',
    })).rejects.toThrow(/bfl submit 500/);
  });

  it('throws containing "bfl poll 500" when polling returns HTTP 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://api.bfl.ai/v1/flux-2-max') {
        return jsonResponse({ id: 'task-p500', polling_url: TEST_POLLING_URL });
      }
      if (url === TEST_POLLING_URL) {
        return new Response('upstream poll boom', { status: 500 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'flux-2-max',
      prompt: 'p',
      aspect: '1:1',
    })).rejects.toThrow(/bfl poll 500/);
  });

  it('throws containing "polling_url" when the submit response omits polling_url', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://api.bfl.ai/v1/flux-2-max') {
        return jsonResponse({ id: 'task-no-url' });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'flux-2-max',
      prompt: 'p',
      aspect: '1:1',
    })).rejects.toThrow(/polling_url/);
  });

  it('throws containing "Error" when the task reaches terminal Error status', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://api.bfl.ai/v1/flux-2-max') {
        return jsonResponse({ id: 'task-err', polling_url: TEST_POLLING_URL });
      }
      if (url === TEST_POLLING_URL) {
        return jsonResponse({ status: 'Error', details: 'something went wrong' });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'flux-2-max',
      prompt: 'p',
      aspect: '1:1',
    })).rejects.toThrow(/Error/);
  });

  it('throws containing "Failed" when the task reaches terminal Failed status', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://api.bfl.ai/v1/flux-2-max') {
        return jsonResponse({ id: 'task-failed', polling_url: TEST_POLLING_URL });
      }
      if (url === TEST_POLLING_URL) {
        return jsonResponse({ status: 'Failed', details: 'pipeline crashed' });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'flux-2-max',
      prompt: 'p',
      aspect: '1:1',
    })).rejects.toThrow(/Failed/);
  });

  it('throws on terminal "Content Moderated" status', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://api.bfl.ai/v1/flux-2-max') {
        return jsonResponse({ id: 'task-mod', polling_url: TEST_POLLING_URL });
      }
      if (url === TEST_POLLING_URL) {
        return jsonResponse({ status: 'Content Moderated', details: 'prompt flagged' });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'flux-2-max',
      prompt: 'p',
      aspect: '1:1',
    })).rejects.toThrow(/Content Moderated/);
  });

  it('throws containing "did not finish in time" when polling exhausts the configured budget', async () => {
    process.env.OD_BFL_IMAGE_MAX_POLL_MS = '30000';
    const baseTime = Date.now();
    let pollObserved = 0;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      return baseTime + pollObserved * 10_000;
    });

    try {
      vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url === 'https://api.bfl.ai/v1/flux-2-max') {
          return jsonResponse({ id: 'task-timeout', polling_url: TEST_POLLING_URL });
        }
        if (url === TEST_POLLING_URL) {
          pollObserved += 1;
          return jsonResponse({ status: 'Pending' });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }));

      await expect(generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'image',
        model: 'flux-2-max',
        prompt: 'p',
        aspect: '1:1',
      })).rejects.toThrow(/did not finish in time/);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('throws containing "BFL_API_KEY" when no env var and no stored credentials provide a key', async () => {
    delete process.env.BFL_API_KEY;
    delete process.env.OD_BFL_API_KEY;

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('fetch should not be called when no API key is configured');
    }));

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'flux-2-max',
      prompt: 'p',
      aspect: '1:1',
    })).rejects.toThrow(/BFL_API_KEY/);
  });

  it('forwards a reference image as input_image with the base64 payload stripped of its data URL prefix', async () => {
    const refDir = path.join(projectsRoot, 'project-1');
    await mkdir(refDir, { recursive: true });
    const refImageName = 'ref.png';
    await writeFile(path.join(refDir, refImageName), IMAGE_BYTES);

    const submitBodies: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.bfl.ai/v1/flux-2-max') {
        submitBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return jsonResponse({ id: 'task-ref', polling_url: TEST_POLLING_URL });
      }
      if (url === TEST_POLLING_URL) {
        return jsonResponse({ status: 'Ready', result: { sample: TEST_IMAGE_URL } });
      }
      if (url === TEST_IMAGE_URL) {
        return bytesResponse(IMAGE_BYTES);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'flux-2-max',
      prompt: 'transform this',
      aspect: '1:1',
      output: 'edited.png',
      image: refImageName,
    });

    expect(submitBodies).toHaveLength(1);
    const body = submitBodies[0]!;
    expect(typeof body.input_image).toBe('string');
    const inputImage = body.input_image as string;
    expect(inputImage.startsWith('data:')).toBe(false);
    expect(inputImage).toBe(IMAGE_BYTES.toString('base64'));
  });
});
