import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia, resolveProjectMediaModel } from '../src/media.js';

const TEST_SENSEAUDIO_BASE_URL = 'https://senseaudio-gateway.example.test';
const TEST_IMAGE_URL = 'https://cdn.example.test/generated/abc.png';
const TEST_IMAGE_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

function buildOkResponse(url = TEST_IMAGE_URL) {
  return new Response(
    JSON.stringify({ url, base_resp: { status_code: 0, status_msg: 'success' } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function buildImageFetchResponse(bytes: Buffer) {
  return new Response(bytes, {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
}

describe('senseaudio image generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-senseaudio-image-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_SENSEAUDIO_API_KEY;
    delete process.env.SENSEAUDIO_API_KEY;
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
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
    delete process.env.OD_SENSEAUDIO_API_KEY;
    delete process.env.SENSEAUDIO_API_KEY;
    await rm(root, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  it('renders a SenseAudio image with the documented sync defaults', async () => {
    await writeConfig({
      providers: {
        senseaudio: {
          apiKey: 'sense-test-key',
          baseUrl: TEST_SENSEAUDIO_BASE_URL,
        },
      },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr === `${TEST_SENSEAUDIO_BASE_URL}/v1/image/sync`) {
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer sense-test-key',
          'content-type': 'application/json',
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          model: 'senseaudio-image-2.0-260319',
          prompt: 'A magazine-style hero poster.',
          size: '1024x1024',
        });
        return buildOkResponse();
      }
      if (urlStr === TEST_IMAGE_URL) {
        return buildImageFetchResponse(TEST_IMAGE_BYTES);
      }
      throw new Error(`unexpected fetch: ${urlStr}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'senseaudio-image-2.0-260319',
      prompt: 'A magazine-style hero poster.',
      output: 'sa-hero.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.providerId).toBe('senseaudio');
    expect(result.providerNote).toContain('senseaudio/senseaudio-image-2.0-260319');
    expect(result.providerNote).toContain('1024x1024');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'sa-hero.png'));
    expect(bytes.equals(TEST_IMAGE_BYTES)).toBe(true);
  });

  it('maps aspect ratios to the SenseAudio size strings', async () => {
    await writeConfig({
      providers: {
        senseaudio: { apiKey: 'sense-test-key', baseUrl: TEST_SENSEAUDIO_BASE_URL },
      },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr === `${TEST_SENSEAUDIO_BASE_URL}/v1/image/sync`) {
        // senseaudio-image-1.0 rejects 1024x1024 / 1280x720; its valid
        // 16:9-ish size is 1664x928. Size map is per-model now.
        expect(JSON.parse(String(init?.body)).size).toBe('1664x928');
        return buildOkResponse();
      }
      return buildImageFetchResponse(TEST_IMAGE_BYTES);
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'senseaudio-image-1.0-260319',
      aspect: '16:9',
      prompt: 'Widescreen banner.',
      output: 'sa-banner.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves orientation when an explicit size is unsupported for the model', async () => {
    await writeConfig({
      providers: {
        senseaudio: { apiKey: 'sense-test-key', baseUrl: TEST_SENSEAUDIO_BASE_URL },
      },
    });
    let sentSize: string | undefined;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr === `${TEST_SENSEAUDIO_BASE_URL}/v1/image/sync`) {
        sentSize = JSON.parse(String(init?.body)).size;
        return buildOkResponse();
      }
      return buildImageFetchResponse(TEST_IMAGE_BYTES);
    });
    vi.stubGlobal('fetch', fetchMock);

    // 1024x2048 is image-2.0's portrait size, NOT valid for image-1.0 (e.g.
    // carried over after a model switch). The renderer must keep the portrait
    // orientation and map to the closest image-1.0 portrait size — never fall
    // back to a square.
    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'senseaudio-image-1.0-260319',
      size: '1024x2048',
      prompt: 'Portrait carried over from another model.',
      output: 'sa-portrait.png',
    });

    expect(sentSize).toBe('928x1664');
  });

  it('falls back to the canonical base URL when none is configured', async () => {
    await writeConfig({
      providers: {
        senseaudio: { apiKey: 'sense-test-key' },
      },
    });

    const fetchMock = vi.fn(async (input: unknown) => {
      const urlStr = String(input);
      if (urlStr === 'https://api.senseaudio.cn/v1/image/sync') {
        return buildOkResponse();
      }
      return buildImageFetchResponse(TEST_IMAGE_BYTES);
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'doubao-seedream-5-0-260128',
      prompt: 'Default base url.',
      output: 'sa-default-base.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reads the API key from OD_SENSEAUDIO_API_KEY when storage is empty', async () => {
    process.env.OD_SENSEAUDIO_API_KEY = 'env-sense-key';
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      if (String(input).endsWith('/v1/image/sync')) {
        expect(init?.headers).toMatchObject({ authorization: 'Bearer env-sense-key' });
        return buildOkResponse();
      }
      return buildImageFetchResponse(TEST_IMAGE_BYTES);
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'senseaudio-image-2.0-260319',
      prompt: 'Env-only key.',
      output: 'sa-env.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
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
        model: 'senseaudio-image-2.0-260319',
        prompt: 'Should fail.',
        output: 'sa-no-key.png',
      }),
    ).rejects.toThrow(/no SenseAudio API key/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces HTTP-level failures with the status code and truncated body', async () => {
    await writeConfig({
      providers: {
        senseaudio: { apiKey: 'sense-test-key', baseUrl: TEST_SENSEAUDIO_BASE_URL },
      },
    });

    const fetchMock = vi.fn(async () =>
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
        model: 'senseaudio-image-2.0-260319',
        prompt: 'Bad auth.',
        output: 'sa-401.png',
      }),
    ).rejects.toThrow('senseaudio image 401: unauthorized');
  });

  it('surfaces upstream error_message verbatim when the body reports failure', async () => {
    await writeConfig({
      providers: {
        senseaudio: { apiKey: 'sense-test-key', baseUrl: TEST_SENSEAUDIO_BASE_URL },
      },
    });

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ error_message: 'sensitive_content_blocked' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'image',
        model: 'senseaudio-image-2.0-260319',
        prompt: 'Blocked.',
        output: 'sa-blocked.png',
      }),
    ).rejects.toThrow('senseaudio image api error: sensitive_content_blocked');
  });

  it('errors when the response body is missing the image url', async () => {
    await writeConfig({
      providers: {
        senseaudio: { apiKey: 'sense-test-key', baseUrl: TEST_SENSEAUDIO_BASE_URL },
      },
    });

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ base_resp: { status_code: 0, status_msg: 'success' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'image',
        model: 'senseaudio-image-2.0-260319',
        prompt: 'Missing url.',
        output: 'sa-missing-url.png',
      }),
    ).rejects.toThrow('senseaudio image response missing url');
  });
});

describe('resolveProjectMediaModel', () => {
  it('prefers an explicit (trimmed) body model over project metadata', () => {
    const project = { metadata: { imageModel: 'metadata-model' } };
    expect(resolveProjectMediaModel('image', 'senseaudio-image-2.0-260319', project)).toBe(
      'senseaudio-image-2.0-260319',
    );
    expect(resolveProjectMediaModel('image', '  senseaudio-image-2.0-260319  ', project)).toBe(
      'senseaudio-image-2.0-260319',
    );
  });

  it('falls back to the project metadata model for the requested surface', () => {
    const project = {
      metadata: {
        imageModel: 'senseaudio-image-1.0-260319',
        videoModel: 'senseaudio-video-2.0-260128',
        audioModel: 'senseaudio-tts',
      },
    };
    expect(resolveProjectMediaModel('image', undefined, project)).toBe('senseaudio-image-1.0-260319');
    expect(resolveProjectMediaModel('video', '', project)).toBe('senseaudio-video-2.0-260128');
    expect(resolveProjectMediaModel('audio', '   ', project)).toBe('senseaudio-tts');
  });

  it('returns undefined when neither the body nor the project metadata has a model', () => {
    expect(resolveProjectMediaModel('image', undefined, { metadata: {} })).toBeUndefined();
    expect(resolveProjectMediaModel('video', undefined, null)).toBeUndefined();
    expect(resolveProjectMediaModel('image', undefined, { metadata: { videoModel: 'x' } })).toBeUndefined();
  });
});
