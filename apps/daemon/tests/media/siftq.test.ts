import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SIFTQ_DEFAULT_BASE_URL,
  buildSiftqVideoBody,
  parseSiftqTask,
  parseSiftqTaskId,
  siftqEndpoint,
  siftqUrls,
} from '../../src/integrations/siftq.js';
import { generateMedia } from '../../src/media/index.js';
import { renderSiftqVideo } from '../../src/media/siftq-video.js';

const FAKE_MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
]);
const TEST_TOKEN = 'unit-test-siftq-token';
const PUBLIC_PATH_TEST_TOKEN = 'public-path-test-token';

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function videoResponse(contentType = 'video/mp4') {
  return new Response(FAKE_MP4, {
    status: 200,
    headers: { 'content-type': contentType },
  });
}

describe('SiftQ MiniMax-H3 V2 contract', () => {
  it('joins all compatible V2 routes against the default base URL', () => {
    expect(siftqUrls(SIFTQ_DEFAULT_BASE_URL, 'task / 1')).toEqual({
      createVideo: 'https://siftq.com/api/minimax/v2/video_generation',
      queryTask: 'https://siftq.com/api/minimax/v2/query/video_generation/task%20%2F%201',
      listTasks: 'https://siftq.com/api/minimax/v2/query/video_generation',
      deleteTask: 'https://siftq.com/api/minimax/v2/video_generation/task%20%2F%201',
      createContextIr: 'https://siftq.com/api/minimax/v2/h3_context_ir',
    });
    expect(() => siftqEndpoint('not a url', 'v2/video_generation')).toThrow(/valid http/);
    expect(() => siftqEndpoint('file:///tmp/siftq', 'v2/video_generation')).toThrow(/http or https/);
    expect(() => siftqEndpoint('https://user:pass@siftq.test/base', 'v2/video_generation')).toThrow(/must not contain/);
    expect(() => siftqEndpoint('https://siftq.test/base?token=x', 'v2/video_generation')).toThrow(/must not contain/);
  });

  it('builds exact text-to-video and first-frame payloads without V1 fields', () => {
    const t2v = buildSiftqVideoBody({
      prompt: ' A cinematic ocean sunrise. ',
      duration: 4,
      resolution: '2K',
      ratio: '21:9',
    });
    expect(t2v).toEqual({
      model: 'MiniMax-H3',
      content: [{ type: 'text', text: 'A cinematic ocean sunrise.' }],
      resolution: '2K',
      duration: 4,
      ratio: '21:9',
    });
    expect(t2v).not.toHaveProperty('prompt');
    expect(t2v).not.toHaveProperty('first_frame_image');

    const i2v = buildSiftqVideoBody({
      prompt: 'Camera pushes in.',
      firstFrameDataUrl: 'data:image/png;base64,AA==',
    });
    expect(i2v.ratio).toBe('adaptive');
    expect(i2v.content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,AA==' },
      role: 'first_frame',
    });
  });

  it.each([
    [{ prompt: '' }, /non-empty prompt/],
    [{ prompt: 'x'.repeat(7001) }, /at most 7000/],
    [{ prompt: 'ok', duration: 0 }, /integer from 4 through 15/],
    [{ prompt: 'ok', duration: 16 }, /integer from 4 through 15/],
    [{ prompt: 'ok', resolution: '1080P' }, /768P or 2K/],
    [{ prompt: 'ok', ratio: 'adaptive' }, /text-to-video ratio/],
    [{ prompt: 'ok', firstFrameDataUrl: 'data:image/gif;base64,AA==' }, /JPEG, PNG, WEBP/],
  ])('rejects invalid creation input %#', (input, message) => {
    expect(() => buildSiftqVideoBody(input)).toThrow(message);
  });

  it('parses only lowercase V2 task states and terminal content', () => {
    expect(parseSiftqTask({ task: { id: '1', status: 'queued' } })).toEqual({
      id: '1',
      status: 'queued',
      content: undefined,
      error: undefined,
    });
    expect(parseSiftqTask({
      task: { id: '1', status: 'succeeded', content: { url: 'https://8.8.8.8/v.mp4' } },
    }).content?.url).toBe('https://8.8.8.8/v.mp4');
    expect(() => parseSiftqTask({ task: { id: '1', status: 'Success' } })).toThrow(/unknown status/);
    expect(() => parseSiftqTask({ task_id: 'legacy', status: 'Success' })).toThrow(/missing task/);
    expect(() => parseSiftqTask({ task: { status: 'queued' } })).toThrow(/missing id/);
    expect(() => parseSiftqTaskId({})).toThrow(/missing task_id/);
  });
});

describe('SiftQ renderer', () => {
  const input = {
    apiKey: TEST_TOKEN,
    prompt: 'A paper bird takes flight',
    duration: 5,
    resolution: '768P',
    ratio: '16:9',
    images: [],
  };

  it('submits, polls, and downloads without leaking bearer auth to the asset host', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'task-1' }))
      .mockResolvedValueOnce(jsonResponse({ task: { id: 'task-1', status: 'queued' } }))
      .mockResolvedValueOnce(jsonResponse({
        task: {
          id: 'task-1',
          status: 'succeeded',
          content: { url: 'https://8.8.8.8/output.mp4' },
        },
      }));
    const download = vi.fn().mockResolvedValue(videoResponse());
    const progress = vi.fn();
    const result = await renderSiftqVideo(
      { ...input, onProgress: progress },
      { fetch: fetchMock, download, sleep: async () => {}, pollIntervalMs: 1 },
    );

    expect(result.bytes).toEqual(FAKE_MP4);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://siftq.com/api/minimax/v2/video_generation');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://siftq.com/api/minimax/v2/query/video_generation/task-1');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'GET',
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(download).toHaveBeenCalledWith('https://8.8.8.8/output.mp4', { method: 'GET' });
    expect(JSON.stringify(download.mock.calls)).not.toContain(TEST_TOKEN);
    expect(progress).toHaveBeenCalledWith('SiftQ task task-1: succeeded');
  });

  it('parses structured HTTP errors without exposing unrelated response fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      type: 'error',
      error: { type: 'authorized_error', message: 'invalid credentials', http_code: '401' },
      request_id: 'req-1',
      internal_secret: 'must-not-appear',
    }, 401));
    let caught: unknown;
    try {
      await renderSiftqVideo(input, { fetch: fetchMock });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(
      'SiftQ video creation failed (401, authorized_error): invalid credentials [request req-1]',
    );
    expect((caught as Error).message).not.toContain('must-not-appear');
  });

  it.each([
    [400, 'bad_request_error'],
    [401, 'authorized_error'],
    [402, 'insufficient_balance_error'],
    [422, 'unprocessable_entity_error'],
    [429, 'rate_limit_error'],
    [500, 'server_error'],
    [529, 'overloaded_error'],
  ])('preserves HTTP %i and error category %s', async (status, type) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      type: 'error',
      error: { type, message: 'provider rejected request', http_code: String(status) },
      request_id: `req-${status}`,
    }, status));
    await expect(renderSiftqVideo(input, { fetch: fetchMock })).rejects.toThrow(
      `(${status}, ${type})`,
    );
  });

  it('rejects failed, cancelled, malformed-success, timeout, multi-image, and invalid downloads', async () => {
    for (const status of ['failed', 'cancelled'] as const) {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonResponse({ task_id: `task-${status}` }))
        .mockResolvedValueOnce(jsonResponse({
          task: { id: `task-${status}`, status, error: { code: 'provider_error', message: 'stopped' } },
        }));
      await expect(renderSiftqVideo(input, { fetch: fetchMock })).rejects.toThrow(`${status}: stopped`);
    }

    const missingUrlFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'missing-url' }))
      .mockResolvedValueOnce(jsonResponse({ task: { id: 'missing-url', status: 'succeeded' } }));
    await expect(renderSiftqVideo(input, { fetch: missingUrlFetch })).rejects.toThrow(/missing task\.content\.url/);

    const mismatchedTaskFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'expected' }))
      .mockResolvedValueOnce(jsonResponse({ task: { id: 'other', status: 'running' } }));
    await expect(renderSiftqVideo(input, { fetch: mismatchedTaskFetch })).rejects.toThrow(/while waiting for expected/);

    let clock = 0;
    const timeoutFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'slow' }))
      .mockImplementation(async () => jsonResponse({ task: { id: 'slow', status: 'running' } }));
    await expect(renderSiftqVideo(input, {
      fetch: timeoutFetch,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
      pollIntervalMs: 6,
      timeoutMs: 10,
    })).rejects.toThrow(/timed out/);

    await expect(renderSiftqVideo({
      ...input,
      images: [{ dataUrl: 'data:image/png;base64,AA==' }, { dataUrl: 'data:image/png;base64,AA==' }],
    })).rejects.toThrow(/only one image/);

    const badDownloadFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'bad-download' }))
      .mockResolvedValueOnce(jsonResponse({
        task: { id: 'bad-download', status: 'succeeded', content: { url: 'https://8.8.8.8/output' } },
      }));
    await expect(renderSiftqVideo(input, {
      fetch: badDownloadFetch,
      download: vi.fn().mockResolvedValue(videoResponse('text/html')),
    })).rejects.toThrow(/unexpected content type/);

    const expiredDownloadFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'expired-download' }))
      .mockResolvedValueOnce(jsonResponse({
        task: { id: 'expired-download', status: 'succeeded', content: { url: 'https://8.8.8.8/expired' } },
      }));
    await expect(renderSiftqVideo(input, {
      fetch: expiredDownloadFetch,
      download: vi.fn().mockResolvedValue(new Response('', { status: 403 })),
    })).rejects.toThrow(/download failed with HTTP 403/);

    const emptyDownloadFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'empty-download' }))
      .mockResolvedValueOnce(jsonResponse({
        task: { id: 'empty-download', status: 'succeeded', content: { url: 'https://8.8.8.8/empty.mp4' } },
      }));
    await expect(renderSiftqVideo(input, {
      fetch: emptyDownloadFetch,
      download: vi.fn().mockResolvedValue(new Response(new Uint8Array(), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      })),
    })).rejects.toThrow(/does not contain an MP4\/MOV signature/);

    const oversizedDownloadFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'oversized-download' }))
      .mockResolvedValueOnce(jsonResponse({
        task: { id: 'oversized-download', status: 'succeeded', content: { url: 'https://8.8.8.8/large.mp4' } },
      }));
    await expect(renderSiftqVideo(input, {
      fetch: oversizedDownloadFetch,
      download: vi.fn().mockResolvedValue(new Response(FAKE_MP4, {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(512 * 1024 * 1024 + 1),
        },
      })),
    })).rejects.toThrow(/safety limit/);
  });
});

describe('SiftQ public media dispatcher path', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalKey = process.env.OD_SIFTQ_API_KEY;
  const originalPoll = process.env.OD_SIFTQ_VIDEO_POLL_INTERVAL_MS;
  const originalStubs = process.env.OD_MEDIA_ALLOW_STUBS;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-siftq-video-'));
    projectRoot = path.join(root, 'root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    process.env.OD_SIFTQ_API_KEY = PUBLIC_PATH_TEST_TOKEN;
    process.env.OD_SIFTQ_VIDEO_POLL_INTERVAL_MS = '1';
    delete process.env.OD_MEDIA_ALLOW_STUBS;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    globalThis.fetch = realFetch;
    if (originalKey === undefined) delete process.env.OD_SIFTQ_API_KEY;
    else process.env.OD_SIFTQ_API_KEY = originalKey;
    if (originalPoll === undefined) delete process.env.OD_SIFTQ_VIDEO_POLL_INTERVAL_MS;
    else process.env.OD_SIFTQ_VIDEO_POLL_INTERVAL_MS = originalPoll;
    if (originalStubs === undefined) delete process.env.OD_MEDIA_ALLOW_STUBS;
    else process.env.OD_MEDIA_ALLOW_STUBS = originalStubs;
    await rm(root, { recursive: true, force: true });
  });

  function args() {
    return {
      surface: 'video' as const,
      model: 'siftq-minimax-h3',
      prompt: 'A hand-drawn city wakes up',
      aspect: '16:9',
      length: 5,
      resolution: '2K',
      output: 'siftq.mp4',
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
    };
  }

  it('generates through generateMedia using the independent SiftQ credential', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ task_id: 'public-1' }))
      .mockResolvedValueOnce(jsonResponse({
        task: {
          id: 'public-1',
          status: 'succeeded',
          content: { url: 'http://8.8.8.8/output.mp4' },
        },
      }))
      .mockResolvedValueOnce(videoResponse());
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia(args());
    expect(result.providerId).toBe('siftq');
    expect(result.providerNote).toBe('SiftQ MiniMax-H3 · 2K · 5s');
    expect(await readFile(path.join(projectsRoot, 'project-1', 'siftq.mp4'))).toEqual(FAKE_MP4);
    const submit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(submit.body))).toEqual({
      model: 'MiniMax-H3',
      content: [{ type: 'text', text: 'A hand-drawn city wakes up' }],
      resolution: '2K',
      duration: 5,
      ratio: '16:9',
    });
    expect(JSON.stringify(fetchMock.mock.calls[2]?.[1] ?? {})).not.toContain(PUBLIC_PATH_TEST_TOKEN);
  });

  it('fails clearly when the independent SiftQ key is missing', async () => {
    delete process.env.OD_SIFTQ_API_KEY;
    await expect(generateMedia(args())).rejects.toThrow(/no SiftQ API key/);
  });
});
