import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';

const TEST_SENSEAUDIO_BASE_URL = 'https://senseaudio-gateway.example.test';
const TEST_VIDEO_URL = 'https://cdn.example.test/generated/clip.mp4';
const TEST_VIDEO_BYTES = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
const CATALOG_ID = 'senseaudio-video-2.0-260128';
const WIRE_MODEL = 'doubao-seedance-2-0-260128';

function createResponse(taskId = 'task-123') {
  return new Response(JSON.stringify({ task_id: taskId }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function statusResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function videoFetchResponse(bytes: Buffer) {
  return new Response(bytes, { status: 200, headers: { 'content-type': 'video/mp4' } });
}

describe('senseaudio video generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;
  const originalPollMs = process.env.OD_SENSEAUDIO_VIDEO_POLL_MS;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-senseaudio-video-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_SENSEAUDIO_API_KEY;
    delete process.env.SENSEAUDIO_API_KEY;
    // Keep the poll loop from sleeping for real in the suite.
    process.env.OD_SENSEAUDIO_VIDEO_POLL_MS = '1';
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    if (originalMediaConfigDir == null) delete process.env.OD_MEDIA_CONFIG_DIR;
    else process.env.OD_MEDIA_CONFIG_DIR = originalMediaConfigDir;
    if (originalDataDir == null) delete process.env.OD_DATA_DIR;
    else process.env.OD_DATA_DIR = originalDataDir;
    if (originalPollMs == null) delete process.env.OD_SENSEAUDIO_VIDEO_POLL_MS;
    else process.env.OD_SENSEAUDIO_VIDEO_POLL_MS = originalPollMs;
    delete process.env.OD_SENSEAUDIO_API_KEY;
    delete process.env.SENSEAUDIO_API_KEY;
    await rm(root, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  it('creates, polls until completed, and writes the mp4 into the project folder', async () => {
    await writeConfig({
      providers: {
        senseaudio: { apiKey: 'sense-test-key', baseUrl: TEST_SENSEAUDIO_BASE_URL },
      },
    });

    let polls = 0;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr === `${TEST_SENSEAUDIO_BASE_URL}/v1/video/create`) {
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer sense-test-key',
          'content-type': 'application/json',
        });
        const body = JSON.parse(String(init?.body));
        // The catalog id maps back to the doubao wire model on the wire.
        expect(body.model).toBe(WIRE_MODEL);
        expect(body.content).toEqual([{ type: 'text', text: 'A drone shot over a coastline.' }]);
        expect(body.ratio).toBe('16:9');
        expect(body.duration).toBe(5);
        return createResponse();
      }
      if (urlStr.startsWith(`${TEST_SENSEAUDIO_BASE_URL}/v1/video/status`)) {
        polls += 1;
        if (polls < 2) return statusResponse({ status: 'processing', progress: 40 });
        return statusResponse({ status: 'completed', video_url: TEST_VIDEO_URL });
      }
      if (urlStr === TEST_VIDEO_URL) {
        return videoFetchResponse(TEST_VIDEO_BYTES);
      }
      throw new Error(`unexpected fetch: ${urlStr}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: CATALOG_ID,
      aspect: '16:9',
      prompt: 'A drone shot over a coastline.',
      output: 'sa-clip.mp4',
    });

    expect(result.providerId).toBe('senseaudio');
    expect(result.providerNote).toContain(`senseaudio/${WIRE_MODEL}`);
    expect(result.providerNote).toContain('16:9');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'sa-clip.mp4'));
    expect(bytes.equals(TEST_VIDEO_BYTES)).toBe(true);
  });

  it('throws when the job reports a failed status', async () => {
    await writeConfig({
      providers: {
        senseaudio: { apiKey: 'sense-test-key', baseUrl: TEST_SENSEAUDIO_BASE_URL },
      },
    });

    const fetchMock = vi.fn(async (input: unknown) => {
      const urlStr = String(input);
      if (urlStr === `${TEST_SENSEAUDIO_BASE_URL}/v1/video/create`) return createResponse();
      if (urlStr.startsWith(`${TEST_SENSEAUDIO_BASE_URL}/v1/video/status`)) {
        return statusResponse({ status: 'failed', error_message: 'nsfw_blocked' });
      }
      throw new Error(`unexpected fetch: ${urlStr}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'video',
        model: CATALOG_ID,
        prompt: 'Blocked clip.',
        output: 'sa-failed.mp4',
      }),
    ).rejects.toThrow('senseaudio video failed: nsfw_blocked');
  });

  it('throws when a completed job is missing the video_url', async () => {
    await writeConfig({
      providers: {
        senseaudio: { apiKey: 'sense-test-key', baseUrl: TEST_SENSEAUDIO_BASE_URL },
      },
    });

    const fetchMock = vi.fn(async (input: unknown) => {
      const urlStr = String(input);
      if (urlStr === `${TEST_SENSEAUDIO_BASE_URL}/v1/video/create`) return createResponse();
      if (urlStr.startsWith(`${TEST_SENSEAUDIO_BASE_URL}/v1/video/status`)) {
        return statusResponse({ status: 'completed' });
      }
      throw new Error(`unexpected fetch: ${urlStr}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'video',
        model: CATALOG_ID,
        prompt: 'No url.',
        output: 'sa-nourl.mp4',
      }),
    ).rejects.toThrow('senseaudio video completed but missing video_url');
  });

  it('errors when no API key is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'video',
        model: CATALOG_ID,
        prompt: 'Should fail.',
        output: 'sa-no-key.mp4',
      }),
    ).rejects.toThrow(/no SenseAudio API key/);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
