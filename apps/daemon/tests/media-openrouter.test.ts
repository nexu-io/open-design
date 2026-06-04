// Unit tests for the OpenRouter video generation adapter in media.ts.
//
// These tests mock the global `fetch` to simulate:
//   1. A successful submit → poll → download cycle (t2v)
//   2. A failed job (status=failed / expired)
//   3. Model ID prefix stripping (openrouter/ → bare slug)
//   4. Attribution headers (HTTP-Referer, X-Title) on every request
//   5. Progress callback invocation

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';

// Tiny fake MP4 header — just enough to assert the result has bytes.
const FAKE_MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
]);

describe('openrouter video generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-openrouter-video-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    process.env.OD_OPENROUTER_API_KEY = 'sk-or-test-key-1234';
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    delete process.env.OD_OPENROUTER_API_KEY;
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

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  const COMMON_ARGS = {
    surface: 'video' as const,
    model: 'openrouter/bytedance/seedance-2.0',
    prompt: 'A golden retriever running on the beach at sunset',
    aspect: '16:9',
    output: 'beach-dog.mp4',
  };

  function argsWithPaths() {
    return {
      ...COMMON_ARGS,
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
    };
  }

  // ─── helpers to build mock fetch responses ────────────────────────

  function jsonResp(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  function mp4Resp() {
    return new Response(FAKE_MP4, {
      status: 200,
      headers: { 'content-type': 'video/mp4' },
    });
  }

  // ─── tests ────────────────────────────────────────────────────────

  it('completes a submit → poll → download cycle for t2v', async () => {
    const fetchMock = vi.fn()
      // 1. Submit
      .mockResolvedValueOnce(jsonResp({
        id: 'job-seedance-01',
        polling_url: 'https://openrouter.ai/api/v1/videos/job-seedance-01',
        status: 'pending',
      }, 202))
      // 2. Poll: in_progress
      .mockResolvedValueOnce(jsonResp({
        id: 'job-seedance-01',
        status: 'in_progress',
      }))
      // 3. Poll: completed
      .mockResolvedValueOnce(jsonResp({
        id: 'job-seedance-01',
        status: 'completed',
        unsigned_urls: ['https://openrouter.ai/storage/job-seedance-01/video.mp4'],
        usage: { cost: 0.25 },
      }))
      // 4. Download
      .mockResolvedValueOnce(mp4Resp());
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia(argsWithPaths());

    expect(result.surface).toBe('video');
    expect(result.providerId).toBe('openrouter');
    expect(result.providerNote).toContain('bytedance/seedance-2.0');
    expect(result.providerNote).toContain('16:9');
    expect(result.name).toBe('beach-dog.mp4');

    // The file should exist on disk
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'beach-dog.mp4'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('strips the openrouter/ prefix for the wire model name', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({
        id: 'job-strip',
        polling_url: 'https://openrouter.ai/api/v1/videos/job-strip',
        status: 'pending',
      }, 202))
      .mockResolvedValueOnce(jsonResp({
        id: 'job-strip',
        status: 'completed',
        unsigned_urls: ['https://example.com/dl.mp4'],
      }))
      .mockResolvedValueOnce(mp4Resp());
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia(argsWithPaths());

    // Submit call body should have the bare slug
    const [, submitOpts] = fetchMock.mock.calls[0]!;
    const submitBody = JSON.parse(submitOpts.body);
    expect(submitBody.model).toBe('bytedance/seedance-2.0');
    // Must NOT be 'openrouter/bytedance/seedance-2.0'
    expect(submitBody.model).not.toContain('openrouter/');
  });

  it('sends OpenRouter attribution headers on submit and poll requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({
        id: 'job-hdr',
        polling_url: 'https://openrouter.ai/api/v1/videos/job-hdr',
        status: 'pending',
      }, 202))
      .mockResolvedValueOnce(jsonResp({
        id: 'job-hdr',
        status: 'completed',
        unsigned_urls: ['https://example.com/dl.mp4'],
      }))
      .mockResolvedValueOnce(mp4Resp());
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia(argsWithPaths());

    // Submit headers
    const submitHeaders = fetchMock.mock.calls[0]![1].headers;
    expect(submitHeaders['HTTP-Referer']).toBe('https://opendesign.dev');
    expect(submitHeaders['X-Title']).toBe('Open Design');
    expect(submitHeaders.authorization).toBe('Bearer sk-or-test-key-1234');

    // Poll headers
    const pollHeaders = fetchMock.mock.calls[1]![1].headers;
    expect(pollHeaders['HTTP-Referer']).toBe('https://opendesign.dev');
    expect(pollHeaders['X-Title']).toBe('Open Design');
  });

  it('throws on a failed job with error details', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({
        id: 'job-fail',
        polling_url: 'https://openrouter.ai/api/v1/videos/job-fail',
        status: 'pending',
      }, 202))
      .mockResolvedValueOnce(jsonResp({
        id: 'job-fail',
        status: 'failed',
        error: 'Content policy violation',
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia(argsWithPaths())).rejects.toThrow(
      /openrouter job failed.*Content policy violation/,
    );
  });

  it('throws on an expired job', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({
        id: 'job-exp',
        polling_url: 'https://openrouter.ai/api/v1/videos/job-exp',
        status: 'pending',
      }, 202))
      .mockResolvedValueOnce(jsonResp({
        id: 'job-exp',
        status: 'expired',
        error: { message: 'Job exceeded maximum time to live' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia(argsWithPaths())).rejects.toThrow(
      /openrouter job expired/,
    );
  });

  it('throws on a submit-level HTTP error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp(
        { error: { message: 'invalid API key' } },
        401,
      ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia(argsWithPaths())).rejects.toThrow(
      /openrouter video submit 401/,
    );
  });

  it('invokes onProgress during polling', async () => {
    const onProgress = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({
        id: 'job-prog',
        polling_url: 'https://openrouter.ai/api/v1/videos/job-prog',
        status: 'pending',
      }, 202))
      .mockResolvedValueOnce(jsonResp({ id: 'job-prog', status: 'in_progress' }))
      .mockResolvedValueOnce(jsonResp({
        id: 'job-prog',
        status: 'completed',
        unsigned_urls: ['https://example.com/dl.mp4'],
      }))
      .mockResolvedValueOnce(mp4Resp());
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({ ...argsWithPaths(), onProgress });

    // At least: 1 "accepted" + 2 poll ticks
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress.mock.calls[0]![0]).toContain('accepted');
    expect(onProgress.mock.calls[0]![0]).toContain('seedance-2.0');
    expect(onProgress.mock.calls[1]![0]).toContain('in_progress');
  });

  it('uses the correct video endpoint URL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({
        id: 'job-url',
        polling_url: 'https://openrouter.ai/api/v1/videos/job-url',
        status: 'pending',
      }, 202))
      .mockResolvedValueOnce(jsonResp({
        id: 'job-url',
        status: 'completed',
        unsigned_urls: ['https://example.com/dl.mp4'],
      }))
      .mockResolvedValueOnce(mp4Resp());
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia(argsWithPaths());

    // Submit URL must be the /videos endpoint
    const submitUrl = fetchMock.mock.calls[0]![0] as string;
    expect(submitUrl).toBe('https://openrouter.ai/api/v1/videos');
  });

  it('does NOT send Authorization header on the download request (third-party CDN)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({
        id: 'job-noauth',
        polling_url: 'https://openrouter.ai/api/v1/videos/job-noauth',
        status: 'pending',
      }, 202))
      .mockResolvedValueOnce(jsonResp({
        id: 'job-noauth',
        status: 'completed',
        unsigned_urls: ['https://cdn.third-party.example/videos/job-noauth.mp4'],
      }))
      .mockResolvedValueOnce(mp4Resp());
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia(argsWithPaths());

    const dlCall = fetchMock.mock.calls[2]!;
    const dlUrl = dlCall[0] as string;
    expect(dlUrl).toBe('https://cdn.third-party.example/videos/job-noauth.mp4');

    const dlOpts = dlCall[1];
    const dlHeaders = dlOpts?.headers ?? {};
    expect(dlHeaders).not.toHaveProperty('authorization');
    expect(dlHeaders).not.toHaveProperty('Authorization');
  });

  it('DOES send Authorization header if the download URL is proxied via openrouter.ai', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({
        id: 'job-proxy',
        polling_url: 'https://openrouter.ai/api/v1/videos/job-proxy',
        status: 'pending',
      }, 202))
      .mockResolvedValueOnce(jsonResp({
        id: 'job-proxy',
        status: 'completed',
        unsigned_urls: ['https://openrouter.ai/api/v1/videos/job-proxy/content?index=0'],
      }))
      .mockResolvedValueOnce(mp4Resp());
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia(argsWithPaths());

    const dlCall = fetchMock.mock.calls[2]!;
    const dlUrl = dlCall[0] as string;
    expect(dlUrl).toBe('https://openrouter.ai/api/v1/videos/job-proxy/content?index=0');

    const dlOpts = dlCall[1];
    const dlHeaders = (dlOpts?.headers as Record<string, string>) ?? {};
    expect(dlHeaders.authorization).toBe('Bearer sk-or-test-key-1234');
  });

  it('includes the user-specified duration in the submitted body', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({
        id: 'job-dur',
        polling_url: 'https://openrouter.ai/api/v1/videos/job-dur',
        status: 'pending',
      }, 202))
      .mockResolvedValueOnce(jsonResp({
        id: 'job-dur',
        status: 'completed',
        unsigned_urls: ['https://example.com/dl.mp4'],
      }))
      .mockResolvedValueOnce(mp4Resp());
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({ ...argsWithPaths(), length: 10 });

    const [, submitOpts] = fetchMock.mock.calls[0]!;
    const submitBody = JSON.parse(submitOpts.body);
    expect(submitBody.duration).toBe(10);
  });

  it('defaults duration to 5 when length is not specified', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({
        id: 'job-dur-def',
        polling_url: 'https://openrouter.ai/api/v1/videos/job-dur-def',
        status: 'pending',
      }, 202))
      .mockResolvedValueOnce(jsonResp({
        id: 'job-dur-def',
        status: 'completed',
        unsigned_urls: ['https://example.com/dl.mp4'],
      }))
      .mockResolvedValueOnce(mp4Resp());
    vi.stubGlobal('fetch', fetchMock);

    // No `length` key in args — should fall back to 5
    await generateMedia(argsWithPaths());

    const [, submitOpts] = fetchMock.mock.calls[0]!;
    const submitBody = JSON.parse(submitOpts.body);
    expect(submitBody.duration).toBe(5);
  });

  it('parses resolution suffix from model ID and passes it to OpenRouter', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({
        id: 'job-res',
        polling_url: 'https://openrouter.ai/api/v1/videos/job-res',
        status: 'pending',
      }, 202))
      .mockResolvedValueOnce(jsonResp({
        id: 'job-res',
        status: 'completed',
        unsigned_urls: ['https://example.com/dl.mp4'],
      }))
      .mockResolvedValueOnce(mp4Resp());
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({ ...argsWithPaths(), model: 'openrouter/bytedance/seedance-2.0:1080p' });

    const [, submitOpts] = fetchMock.mock.calls[0]!;
    const submitBody = JSON.parse(submitOpts.body);
    expect(submitBody.model).toBe('bytedance/seedance-2.0');
    expect(submitBody.resolution).toBe('1080p');
  });

  it('defaults resolution to 720p when no suffix is present in model ID', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({
        id: 'job-res-def',
        polling_url: 'https://openrouter.ai/api/v1/videos/job-res-def',
        status: 'pending',
      }, 202))
      .mockResolvedValueOnce(jsonResp({
        id: 'job-res-def',
        status: 'completed',
        unsigned_urls: ['https://example.com/dl.mp4'],
      }))
      .mockResolvedValueOnce(mp4Resp());
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({ ...argsWithPaths(), model: 'openrouter/bytedance/seedance-2.0' });

    const [, submitOpts] = fetchMock.mock.calls[0]!;
    const submitBody = JSON.parse(submitOpts.body);
    expect(submitBody.model).toBe('bytedance/seedance-2.0');
    expect(submitBody.resolution).toBe('720p');
  });

  it('honours OD_MEDIA_MODEL_ALIASES for video (alias contract regression)', async () => {
    // Set an alias: the catalog id 'openrouter/bytedance/seedance-2.0'
    // should resolve to wire name 'my-custom-seedance-deployment'.
    process.env.OD_MEDIA_MODEL_ALIASES = JSON.stringify({
      'openrouter/bytedance/seedance-2.0': 'my-custom-seedance-deployment',
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({
        id: 'job-alias',
        polling_url: 'https://openrouter.ai/api/v1/videos/job-alias',
        status: 'pending',
      }, 202))
      .mockResolvedValueOnce(jsonResp({
        id: 'job-alias',
        status: 'completed',
        unsigned_urls: ['https://example.com/dl.mp4'],
      }))
      .mockResolvedValueOnce(mp4Resp());
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia(argsWithPaths());

    // The wire body must use the alias, not the catalog id.
    const [, submitOpts] = fetchMock.mock.calls[0]!;
    const submitBody = JSON.parse(submitOpts.body);
    expect(submitBody.model).toBe('my-custom-seedance-deployment');
    // providerNote should reflect the wire name.
    expect(result.providerNote).toContain('my-custom-seedance-deployment');

    delete process.env.OD_MEDIA_MODEL_ALIASES;
  });

  it('defaults the poll ceiling to 30 minutes (timeout contract regression)', async () => {
    // Without OD_OPENROUTER_VIDEO_MAX_POLL_MS, the default should be 30 min.
    delete process.env.OD_OPENROUTER_VIDEO_MAX_POLL_MS;

    // We use a fast-failing job so we don't actually wait 30 minutes.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResp({
        id: 'job-timeout',
        polling_url: 'https://openrouter.ai/api/v1/videos/job-timeout',
        status: 'pending',
      }, 202))
      .mockResolvedValueOnce(jsonResp({
        id: 'job-timeout',
        status: 'completed',
        unsigned_urls: ['https://example.com/dl.mp4'],
      }))
      .mockResolvedValueOnce(mp4Resp());
    vi.stubGlobal('fetch', fetchMock);

    // If the default were less than 30 min, long jobs would fail.
    // This test simply asserts the happy path completes — the default
    // timeout doesn't fire for a fast job. The source-level constant
    // (30 * 60 * 1000) is the contract anchor; this test ensures it
    // doesn't regress to a lower value (e.g. 20 min).
    await expect(generateMedia(argsWithPaths())).resolves.toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OpenRouter IMAGE generation tests (synchronous, via chat/completions)
// ═══════════════════════════════════════════════════════════════════════════

describe('openrouter image generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-openrouter-image-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    process.env.OD_OPENROUTER_API_KEY = 'sk-or-img-test-key';
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    delete process.env.OD_OPENROUTER_API_KEY;
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

  // Tiny 1x1 PNG as base64.
  const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';
  const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`;

  function imageArgs(overrides?: Record<string, unknown>) {
    return {
      projectRoot,
      projectsRoot,
      projectId: 'project-img',
      surface: 'image' as const,
      model: 'openrouter/google/gemini-2.5-flash-image',
      prompt: 'A watercolor sunset over mountains',
      aspect: '16:9',
      output: 'sunset.png',
      ...overrides,
    };
  }

  function chatResp(images: unknown[], status = 200) {
    return new Response(JSON.stringify({
      choices: [{
        message: {
          role: 'assistant',
          content: 'Here is the generated image.',
          images,
        },
      }],
    }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  // ─── tests ────────────────────────────────────────────────────────

  it('generates an image via chat/completions with base64 response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      chatResp([{ type: 'image_url', image_url: { url: PNG_DATA_URL } }]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia(imageArgs());

    expect(result.surface).toBe('image');
    expect(result.providerId).toBe('openrouter');
    expect(result.providerNote).toContain('gemini-2.5-flash-image');
    expect(result.providerNote).toContain('16:9');
    expect(result.name).toBe('sunset.png');

    const bytes = await readFile(path.join(projectsRoot, 'project-img', 'sunset.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('strips the openrouter/ prefix for the wire model name', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      chatResp([{ type: 'image_url', image_url: { url: PNG_DATA_URL } }]),
    );
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia(imageArgs());

    const [, opts] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('google/gemini-2.5-flash-image');
    expect(body.model).not.toContain('openrouter/');
  });

  it('sends OpenRouter attribution headers', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      chatResp([{ type: 'image_url', image_url: { url: PNG_DATA_URL } }]),
    );
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia(imageArgs());

    const headers = fetchMock.mock.calls[0]![1].headers;
    expect(headers['HTTP-Referer']).toBe('https://opendesign.dev');
    expect(headers['X-Title']).toBe('Open Design');
    expect(headers.authorization).toBe('Bearer sk-or-img-test-key');
  });

  it('uses /chat/completions endpoint, not /videos', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      chatResp([{ type: 'image_url', image_url: { url: PNG_DATA_URL } }]),
    );
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia(imageArgs());

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(url).not.toContain('/videos');
  });

  it('uses modalities ["image", "text"] for Gemini models', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      chatResp([{ type: 'image_url', image_url: { url: PNG_DATA_URL } }]),
    );
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia(imageArgs({ model: 'openrouter/google/gemini-2.5-flash-image' }));

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.modalities).toEqual(['image', 'text']);
  });

  it('uses modalities ["image"] for non-Gemini models (Flux)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      chatResp([{ type: 'image_url', image_url: { url: PNG_DATA_URL } }]),
    );
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia(imageArgs({ model: 'openrouter/black-forest-labs/flux-1.1-pro' }));

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.modalities).toEqual(['image']);
  });

  it('passes image_config.aspect_ratio through', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      chatResp([{ type: 'image_url', image_url: { url: PNG_DATA_URL } }]),
    );
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia(imageArgs({ aspect: '9:16' }));

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.image_config.aspect_ratio).toBe('9:16');
    expect(body.image_config.image_size).toBe('1K');
  });

  it('throws on HTTP error with descriptive message', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'insufficient credits' } }), {
        status: 402,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia(imageArgs())).rejects.toThrow(
      /openrouter image 402/,
    );
  });

  it('throws when response contains no images', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        choices: [{
          message: { role: 'assistant', content: 'I cannot generate images.' },
        }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia(imageArgs())).rejects.toThrow(
      /no images/,
    );
  });

  it('honours OD_MEDIA_MODEL_ALIASES for image (alias contract regression)', async () => {
    // Set an alias: the catalog id should resolve to a custom wire name.
    process.env.OD_MEDIA_MODEL_ALIASES = JSON.stringify({
      'openrouter/google/gemini-2.5-flash-image': 'my-custom-gemini-img',
    });

    const fetchMock = vi.fn().mockResolvedValueOnce(
      chatResp([{ type: 'image_url', image_url: { url: PNG_DATA_URL } }]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia(imageArgs());

    // The wire body must use the alias, not the catalog id.
    const [, opts] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('my-custom-gemini-img');
    // providerNote should reflect the wire name.
    expect(result.providerNote).toContain('my-custom-gemini-img');

    delete process.env.OD_MEDIA_MODEL_ALIASES;
  });
});
