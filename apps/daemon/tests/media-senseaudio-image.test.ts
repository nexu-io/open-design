import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';

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
        expect(JSON.parse(String(init?.body)).size).toBe('1280x720');
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
