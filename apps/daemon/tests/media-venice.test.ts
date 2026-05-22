import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';

const TEST_BASE_URL = 'https://venice-gateway.example.test/api/v1';
// 1×1 transparent PNG, base64-encoded — minimal valid bytes so the dispatcher's
// suggested-ext sniffing and the FileViewer downstream stay happy.
const ONE_PIXEL_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const ONE_PIXEL_PNG_BYTES = Buffer.from(ONE_PIXEL_PNG_B64, 'base64');

function veniceImageOkResponse(b64 = ONE_PIXEL_PNG_B64): Response {
  return new Response(
    JSON.stringify({
      id: 'generate-image-1234567890',
      images: [b64],
      timing: { total: 1234 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('venice image generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-venice-image-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_VENICE_API_KEY;
    delete process.env.VENICE_API_KEY;
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
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
    delete process.env.OD_VENICE_API_KEY;
    delete process.env.VENICE_API_KEY;
    await rm(root, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  it('sends resolution-tier sizing for gpt-image-2', async () => {
    await writeConfig({
      providers: { venice: { apiKey: 'venice-test-key', baseUrl: TEST_BASE_URL } },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe(`${TEST_BASE_URL}/image/generate`);
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer venice-test-key',
        'content-type': 'application/json',
      });
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: 'gpt-image-2',
        prompt: 'A magazine-style hero poster.',
        aspect_ratio: '16:9',
        resolution: '2K',
        format: 'png',
      });
      // Pixel sizing fields MUST be absent for resolution-tier models.
      expect(body.width).toBeUndefined();
      expect(body.height).toBeUndefined();
      return veniceImageOkResponse();
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'venice/gpt-image-2',
      aspect: '16:9',
      prompt: 'A magazine-style hero poster.',
      output: 'venice-hero.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.providerId).toBe('venice');
    expect(result.providerNote).toContain('venice/gpt-image-2');
    expect(result.providerNote).toContain('16:9 @ 2K');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'venice-hero.png'));
    expect(bytes.equals(ONE_PIXEL_PNG_BYTES)).toBe(true);
  });

  it('sends explicit width/height for pixel models like venice-sd35', async () => {
    await writeConfig({
      providers: { venice: { apiKey: 'k', baseUrl: TEST_BASE_URL } },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe(`${TEST_BASE_URL}/image/generate`);
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: 'venice-sd35',
        width: 1280,
        height: 720,
      });
      expect(body.aspect_ratio).toBeUndefined();
      expect(body.resolution).toBeUndefined();
      return veniceImageOkResponse();
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'venice/venice-sd35',
      aspect: '16:9',
      prompt: 'Widescreen banner.',
      output: 'venice-sd35.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('routes *-edit models through /image/edit when a reference image is supplied', async () => {
    await writeConfig({
      providers: { venice: { apiKey: 'k', baseUrl: TEST_BASE_URL } },
    });
    // Drop a reference png alongside the project so resolveProjectImage
    // picks it up. The dispatcher reads it as a data: URL and forwards it
    // as `image` to /image/edit.
    const projectDir = path.join(projectsRoot, 'project-1');
    await mkdir(projectDir, { recursive: true });
    const refPath = path.join(projectDir, 'ref.png');
    await writeFile(refPath, ONE_PIXEL_PNG_BYTES);

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe(`${TEST_BASE_URL}/image/edit`);
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('qwen-edit');
      expect(typeof body.image).toBe('string');
      expect(body.image.startsWith('data:image/png;base64,')).toBe(true);
      expect(body.output_format).toBe('png');
      expect(body.format).toBeUndefined();
      return veniceImageOkResponse();
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'venice/qwen-edit',
      prompt: 'Make the sky teal.',
      image: 'ref.png',
      output: 'venice-edit.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.providerNote).toContain('· edit');
  });

  it('reads the API key from VENICE_API_KEY when storage is empty', async () => {
    process.env.VENICE_API_KEY = 'env-venice-key';
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toContain('/image/generate');
      expect(init?.headers).toMatchObject({ authorization: 'Bearer env-venice-key' });
      return veniceImageOkResponse();
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'venice/qwen-image-2',
      prompt: 'Env-only key.',
      output: 'venice-env.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('errors when no API key is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'image',
        model: 'venice/gpt-image-2',
        prompt: 'Should fail.',
        output: 'venice-no-key.png',
      }),
    ).rejects.toThrow(/no Venice API key/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces HTTP-level failures with the status code and truncated body', async () => {
    await writeConfig({ providers: { venice: { apiKey: 'k', baseUrl: TEST_BASE_URL } } });
    const fetchMock = vi.fn(
      async () =>
        new Response('unauthorized', {
          status: 401,
          headers: { 'content-type': 'text/plain' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'image',
        model: 'venice/gpt-image-2',
        aspect: '1:1',
        prompt: 'Bad auth.',
        output: 'venice-401.png',
      }),
    ).rejects.toThrow('venice image 401: unauthorized');
  });
});

describe('venice video generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-venice-video-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_VENICE_API_KEY;
    delete process.env.VENICE_API_KEY;
    // Tight poll ceiling for the async path so the test runs fast.
    process.env.OD_VENICE_VIDEO_MAX_POLL_MS = '60000';
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
    delete process.env.OD_VENICE_API_KEY;
    delete process.env.VENICE_API_KEY;
    delete process.env.OD_VENICE_VIDEO_MAX_POLL_MS;
    await rm(root, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  it('queues then retrieves inline mp4 bytes for seedance-2-0-text-to-video', async () => {
    await writeConfig({
      providers: { venice: { apiKey: 'venice-test-key', baseUrl: TEST_BASE_URL } },
    });
    const FAKE_MP4 = Buffer.from('MP4 BYTES TEST');

    let queueCalls = 0;
    let retrieveCalls = 0;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === `${TEST_BASE_URL}/video/queue`) {
        queueCalls += 1;
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          model: 'seedance-2-0-text-to-video',
          prompt: 'A gondola at sunset.',
          duration: '5s',
          resolution: '720p',
          aspect_ratio: '16:9',
          audio: true,
        });
        return new Response(JSON.stringify({ model: body.model, queue_id: 'qid-abc' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === `${TEST_BASE_URL}/video/retrieve`) {
        retrieveCalls += 1;
        // First retrieve → still processing. Second → mp4.
        if (retrieveCalls === 1) {
          return new Response(JSON.stringify({ status: 'PROCESSING', average_execution_time: 30000 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(FAKE_MP4, {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'venice/seedance-2-0-text-to-video',
      aspect: '16:9',
      length: 5,
      prompt: 'A gondola at sunset.',
      output: 'venice.mp4',
    });

    expect(queueCalls).toBe(1);
    expect(retrieveCalls).toBe(2);
    expect(result.providerId).toBe('venice');
    expect(result.providerNote).toContain('venice/seedance-2-0-text-to-video');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'venice.mp4'));
    expect(bytes.equals(FAKE_MP4)).toBe(true);
  });

  it('uses the queue-time download_url for grok-imagine-*-private', async () => {
    await writeConfig({
      providers: { venice: { apiKey: 'k', baseUrl: TEST_BASE_URL } },
    });
    const FAKE_MP4 = Buffer.from('PRIVATE MP4');
    const PRIVATE_URL = 'https://private-share.venice.ai/v1/share/read/abc';

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === `${TEST_BASE_URL}/video/queue`) {
        const body = JSON.parse(String(init?.body));
        // Private variants should NOT send aspect_ratio for i2v of seedance,
        // but grok-imagine-text-to-video-private accepts it.
        expect(body.model).toBe('grok-imagine-text-to-video-private');
        return new Response(
          JSON.stringify({
            model: body.model,
            queue_id: 'qid-private',
            download_url: PRIVATE_URL,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === `${TEST_BASE_URL}/video/retrieve`) {
        return new Response(JSON.stringify({ status: 'COMPLETED' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === PRIVATE_URL) {
        return new Response(FAKE_MP4, {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'venice/grok-imagine-text-to-video-private',
      aspect: '16:9',
      length: 5,
      prompt: 'A private video.',
      output: 'venice-private.mp4',
    });

    expect(result.providerNote).toContain('private');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'venice-private.mp4'));
    expect(bytes.equals(FAKE_MP4)).toBe(true);
  });

  it('omits aspect_ratio for seedance-2-0-image-to-video and forwards image_url', async () => {
    await writeConfig({
      providers: { venice: { apiKey: 'k', baseUrl: TEST_BASE_URL } },
    });
    const projectDir = path.join(projectsRoot, 'project-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'ref.png'), ONE_PIXEL_PNG_BYTES);

    const FAKE_MP4 = Buffer.from('MP4');
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === `${TEST_BASE_URL}/video/queue`) {
        const body = JSON.parse(String(init?.body));
        expect(body.aspect_ratio).toBeUndefined();
        expect(typeof body.image_url).toBe('string');
        expect(body.image_url.startsWith('data:image/png;base64,')).toBe(true);
        return new Response(JSON.stringify({ model: body.model, queue_id: 'qid' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === `${TEST_BASE_URL}/video/retrieve`) {
        return new Response(FAKE_MP4, {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'venice/seedance-2-0-image-to-video',
      aspect: '16:9',
      length: 5,
      image: 'ref.png',
      prompt: 'Animate the still frame.',
      output: 'venice-i2v.mp4',
    });

    expect(fetchMock).toHaveBeenCalled();
  });

  it('surfaces upstream FAILED status with the error message', async () => {
    await writeConfig({
      providers: { venice: { apiKey: 'k', baseUrl: TEST_BASE_URL } },
    });
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === `${TEST_BASE_URL}/video/queue`) {
        return new Response(JSON.stringify({ queue_id: 'q' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ status: 'FAILED', error: { message: 'sensitive_content_blocked' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'video',
        model: 'venice/wan-2.5-preview-text-to-video',
        aspect: '16:9',
        length: 5,
        prompt: 'should fail upstream.',
        output: 'venice-fail.mp4',
      }),
    ).rejects.toThrow(/venice video failed: sensitive_content_blocked/);
  });
});

describe('venice TTS', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-venice-tts-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_VENICE_API_KEY;
    delete process.env.VENICE_API_KEY;
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
    delete process.env.OD_VENICE_API_KEY;
    delete process.env.VENICE_API_KEY;
    await rm(root, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  it('POSTs OpenAI-compatible /audio/speech and persists mp3 bytes', async () => {
    await writeConfig({
      providers: { venice: { apiKey: 'venice-test-key', baseUrl: TEST_BASE_URL } },
    });
    const MP3 = Buffer.from([0xff, 0xfb, 0x00, 0x01]); // minimal mp3 frame header
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe(`${TEST_BASE_URL}/audio/speech`);
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer venice-test-key',
        'content-type': 'application/json',
      });
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: 'gpt-4o-mini-tts',
        input: 'Hello, world.',
        voice: 'alloy',
        response_format: 'mp3',
      });
      return new Response(MP3, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      audioKind: 'speech',
      model: 'venice/gpt-4o-mini-tts',
      prompt: 'Hello, world.',
      output: 'venice.mp3',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.providerNote).toContain('venice/gpt-4o-mini-tts');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'venice.mp3'));
    expect(bytes.equals(MP3)).toBe(true);
  });
});
