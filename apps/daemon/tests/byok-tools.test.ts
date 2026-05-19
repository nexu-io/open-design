import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BYOK_SENSEAUDIO_TOOLS,
  executeGenerateImage,
  executeGenerateVideo,
} from '../src/byok-tools.js';

describe('BYOK_SENSEAUDIO_TOOLS', () => {
  it('exports an OpenAI-shaped generate_image tool definition', () => {
    const tool = BYOK_SENSEAUDIO_TOOLS.find(
      (t) => t.function.name === 'generate_image',
    );
    expect(tool).toBeDefined();
    expect(tool!.type).toBe('function');
    expect(tool!.function.parameters.required).toEqual(['prompt']);
    expect(tool!.function.parameters.properties.aspect_ratio.enum).toEqual([
      '1:1',
      '16:9',
      '9:16',
      '4:3',
      '3:4',
    ]);
  });

  it('exposes both generate_image and generate_video tools', () => {
    const names = BYOK_SENSEAUDIO_TOOLS.map((t) => t.function.name).sort();
    expect(names).toEqual(['generate_image', 'generate_video']);
  });
});

describe('executeGenerateImage', () => {
  let root: string;
  let projectsRoot: string;
  const PROJECT_ID = 'test-project';
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-byok-tools-'));
    projectsRoot = path.join(root, 'projects');
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
    await rm(root, { recursive: true, force: true });
  });

  const baseCtx = () => ({
    projectRoot: root,
    projectsRoot,
    projectId: PROJECT_ID,
    upstreamApiKey: 'sa-byok-key',
    upstreamBaseUrl: 'https://api.senseaudio.cn',
  });

  it('calls /v1/image/sync, downloads the URL, persists bytes, and returns a daemon URL', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.senseaudio.cn/v1/image/sync') {
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer sa-byok-key',
          'content-type': 'application/json',
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          model: 'senseaudio-image-2.0-260319',
          prompt: 'a tabby cat playing with yarn',
          size: '1024x1024',
        });
        return new Response(
          JSON.stringify({
            url: 'https://cdn.example.test/generated/cat.png',
            base_resp: { status_code: 0, status_msg: 'success' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === 'https://cdn.example.test/generated/cat.png') {
        return new Response(pngBytes, {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateImage(
      { prompt: 'a tabby cat playing with yarn' },
      baseCtx(),
    );

    expect(result.ok).toBe(true);
    // Returns a relative URL through the project file route so the
    // chat UI loads same-origin via Next.js's /api/:path* rewrite,
    // satisfying the strict CSP `img-src 'self'`. Path component is
    // url-encoded so unusual (but isSafeId-passing) project ids don't
    // break the URL.
    expect(result.url).toMatch(
      new RegExp(`^/api/projects/${PROJECT_ID}/files/byok-[a-z0-9-]+\\.png$`),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Persisted file lives inside the project folder where listFiles /
    // readProjectFile / archive plumbing will all discover it.
    const filename = result.url!.split('/').pop()!;
    const onDisk = await readFile(path.join(projectsRoot, PROJECT_ID, filename));
    expect(onDisk.equals(pngBytes)).toBe(true);
  });

  it('honours args.model when the LLM picks a SenseAudio image model', async () => {
    const pngBytes = Buffer.from([0x89, 0x50]);
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/image/sync')) {
        expect(JSON.parse(String(init?.body)).model).toBe('doubao-seedream-5-0-260128');
        return new Response(
          JSON.stringify({ url: 'https://cdn.example.test/hi.png' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(pngBytes, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateImage(
      { prompt: 'wallpaper', model: 'doubao-seedream-5-0-260128' },
      baseCtx(),
    );
    expect(result.ok).toBe(true);
  });

  it('falls back to ctx.defaultImageModel when args.model is missing', async () => {
    const pngBytes = Buffer.from([0x89, 0x50]);
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/image/sync')) {
        expect(JSON.parse(String(init?.body)).model).toBe('senseaudio-image-1.0-260319');
        return new Response(
          JSON.stringify({ url: 'https://cdn.example.test/std.png' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(pngBytes, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateImage(
      { prompt: 'standard' },
      { ...baseCtx(), defaultImageModel: 'senseaudio-image-1.0-260319' },
    );
    expect(result.ok).toBe(true);
  });

  it('ignores args.model when it is not in the SenseAudio allowlist', async () => {
    const pngBytes = Buffer.from([0x89, 0x50]);
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/image/sync')) {
        // Falls through to ctx.defaultImageModel (registry-valid).
        expect(JSON.parse(String(init?.body)).model).toBe('senseaudio-image-1.0-260319');
        return new Response(
          JSON.stringify({ url: 'https://cdn.example.test/x.png' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(pngBytes, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateImage(
      { prompt: 'spoofed', model: 'evil-model-id' },
      { ...baseCtx(), defaultImageModel: 'senseaudio-image-1.0-260319' },
    );
    expect(result.ok).toBe(true);
  });

  it('falls back to registry default when both args.model and ctx.defaultImageModel are missing/invalid', async () => {
    const pngBytes = Buffer.from([0x89, 0x50]);
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/image/sync')) {
        // Registry default is the first SenseAudio entry — 2.0 today.
        expect(JSON.parse(String(init?.body)).model).toBe('senseaudio-image-2.0-260319');
        return new Response(
          JSON.stringify({ url: 'https://cdn.example.test/d.png' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(pngBytes, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateImage(
      { prompt: 'no model anywhere' },
      { ...baseCtx(), defaultImageModel: 'also-bogus' },
    );
    expect(result.ok).toBe(true);
  });

  it('rejects unsafe projectId before any upstream call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateImage(
      { prompt: 'x' },
      { ...baseCtx(), projectId: '../escape' },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid projectId/);
    // ensureProject runs up front so the unsafe id is caught BEFORE
    // any senseaudio upstream call goes out — no token spent, no
    // attempt to write outside the project tree.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps aspect_ratio to the SenseAudio size string', async () => {
    const pngBytes = Buffer.from([0x89, 0x50]);
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/image/sync')) {
        expect(JSON.parse(String(init?.body)).size).toBe('1280x720');
        return new Response(
          JSON.stringify({ url: 'https://cdn.example.test/wide.png' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(pngBytes, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateImage(
      { prompt: 'widescreen banner', aspect_ratio: '16:9' },
      baseCtx(),
    );

    expect(result.ok).toBe(true);
  });

  it('falls back to 1:1 for unknown aspect_ratio values', async () => {
    const pngBytes = Buffer.from([0x89, 0x50]);
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/image/sync')) {
        expect(JSON.parse(String(init?.body)).size).toBe('1024x1024');
        return new Response(
          JSON.stringify({ url: 'https://cdn.example.test/square.png' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(pngBytes, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateImage(
      { prompt: 'square thing', aspect_ratio: 'something-else' },
      baseCtx(),
    );

    expect(result.ok).toBe(true);
  });

  it('returns { ok: false } on missing prompt', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateImage({}, baseCtx());

    expect(result).toEqual({ ok: false, error: 'prompt is required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns { ok: false } when no API key is available', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const ctx = { ...baseCtx(), upstreamApiKey: '' };
    const result = await executeGenerateImage({ prompt: 'whatever' }, ctx);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no SenseAudio API key/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces HTTP failures with status code and truncated body', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('unauthorized', {
        status: 401,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateImage({ prompt: 'x' }, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/senseaudio image 401/);
  });

  it('surfaces error_message envelope verbatim', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ error_message: 'sensitive_content_blocked' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateImage({ prompt: 'x' }, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/sensitive_content_blocked/);
  });

  it('surfaces base_resp non-zero status_code', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          base_resp: { status_code: 1004, status_msg: 'quota exhausted' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateImage({ prompt: 'x' }, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/api error 1004/);
    expect(result.error).toMatch(/quota exhausted/);
  });

  it('returns { ok: false } when upstream returns no url', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ base_resp: { status_code: 0, status_msg: 'ok' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateImage({ prompt: 'x' }, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/missing url/);
  });

  it('returns { ok: false } when the image download fails', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith('/v1/image/sync')) {
        return new Response(
          JSON.stringify({ url: 'https://cdn.example.test/will-404.png' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateImage({ prompt: 'x' }, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/image download 404/);
  });
});

describe('BYOK_SENSEAUDIO_TOOLS — video', () => {
  it('exposes a generate_video tool definition with the documented param surface', () => {
    const video = BYOK_SENSEAUDIO_TOOLS.find(
      (t) => t.function.name === 'generate_video',
    );
    expect(video).toBeDefined();
    const props = video!.function.parameters.properties as Record<string, any>;
    expect(video!.function.parameters.required).toEqual(['prompt']);
    expect(props.aspect_ratio.enum).toEqual(['16:9', '9:16', '4:3', '3:4', '1:1']);
    expect(props.resolution.enum).toEqual(['480p', '720p', '1080p']);
    expect(props.duration).toMatchObject({ type: 'integer', minimum: 4, maximum: 15 });
    expect(props.generate_audio.type).toBe('boolean');
  });
});

describe('executeGenerateVideo', () => {
  let root: string;
  let projectsRoot: string;
  const PROJECT_ID = 'test-project';
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-byok-video-'));
    projectsRoot = path.join(root, 'projects');
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
    await rm(root, { recursive: true, force: true });
  });

  const baseCtx = () => ({
    projectRoot: root,
    projectsRoot,
    projectId: PROJECT_ID,
    upstreamApiKey: 'sa-byok-key',
    upstreamBaseUrl: 'https://api.senseaudio.cn',
    // Keep tests fast — 1 ms between polls instead of the production 5 s.
    videoPollIntervalMs: 1,
  });

  it('creates, polls until completed, downloads, and writes the mp4 into the project folder', async () => {
    const mp4Bytes = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);

      if (url === 'https://api.senseaudio.cn/v1/video/create') {
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer sa-byok-key',
          'content-type': 'application/json',
        });
        const body = JSON.parse(String(init?.body));
        expect(body).toEqual({
          model: 'doubao-seedance-2-0-260128',
          content: [{ type: 'text', text: 'a sunset over the ocean' }],
          duration: 8,
          resolution: '1080p',
          ratio: '16:9',
          provider_specific: { generate_audio: true },
        });
        return new Response(
          JSON.stringify({ task_id: 'task-abc' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.startsWith('https://api.senseaudio.cn/v1/video/status?id=task-abc')) {
        pollCount++;
        if (pollCount === 1) {
          return new Response(
            JSON.stringify({ status: 'pending', progress: 0 }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (pollCount === 2) {
          return new Response(
            JSON.stringify({ status: 'processing', progress: 50 }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            status: 'completed',
            progress: 100,
            video_url: 'https://cdn.example.test/video/done.mp4',
            duration: 8,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url === 'https://cdn.example.test/video/done.mp4') {
        return new Response(mp4Bytes, {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateVideo(
      {
        prompt: 'a sunset over the ocean',
        aspect_ratio: '16:9',
        duration: 8,
        resolution: '1080p',
        generate_audio: true,
      },
      baseCtx(),
    );

    expect(result.ok).toBe(true);
    expect(result.url).toMatch(
      new RegExp(`^/api/projects/${PROJECT_ID}/files/byok-video-[a-z0-9-]+\\.mp4$`),
    );

    // 1× create + 3× poll + 1× download = 5 fetches total.
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(pollCount).toBe(3);

    const filename = result.url!.split('/').pop()!;
    const onDisk = await readFile(path.join(projectsRoot, PROJECT_ID, filename));
    expect(onDisk.equals(mp4Bytes)).toBe(true);
  });

  it('defaults duration / resolution / aspect when caller omits them', async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/video/create')) {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          duration: 5,
          resolution: '720p',
          ratio: '16:9',
          provider_specific: { generate_audio: false },
        });
        return new Response(
          JSON.stringify({ task_id: 'task-defaults' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.startsWith('https://api.senseaudio.cn/v1/video/status')) {
        return new Response(
          JSON.stringify({
            status: 'completed',
            video_url: 'https://cdn.example.test/video/d.mp4',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(Buffer.from([0x01]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateVideo({ prompt: 'minimal' }, baseCtx());
    expect(result.ok).toBe(true);
  });

  it('clamps duration outside the 4–15 range and rejects non-enum aspect_ratio / resolution', async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/video/create')) {
        const body = JSON.parse(String(init?.body));
        // 99 → clamped to 15; 'octagonal' → falls back to '16:9';
        // '8k' → falls back to '720p'.
        expect(body).toMatchObject({
          duration: 15,
          resolution: '720p',
          ratio: '16:9',
        });
        return new Response(
          JSON.stringify({ task_id: 'task-clamp' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.startsWith('https://api.senseaudio.cn/v1/video/status')) {
        return new Response(
          JSON.stringify({
            status: 'completed',
            video_url: 'https://cdn.example.test/clamp.mp4',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(Buffer.from([0x02]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateVideo(
      {
        prompt: 'overflow',
        duration: 99,
        aspect_ratio: 'octagonal',
        resolution: '8k',
      },
      baseCtx(),
    );
    expect(result.ok).toBe(true);
  });

  it('surfaces a failed status as a tool error so the model can apologize', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith('/v1/video/create')) {
        return new Response(
          JSON.stringify({ task_id: 'task-fail' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.startsWith('https://api.senseaudio.cn/v1/video/status')) {
        return new Response(
          JSON.stringify({
            status: 'failed',
            error_message: 'sensitive_content_blocked',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateVideo(
      { prompt: 'blocked content' },
      baseCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/senseaudio video failed/);
    expect(result.error).toMatch(/sensitive_content_blocked/);
  });

  it('times out after SENSEAUDIO_VIDEO_MAX_POLLS polls when the job stays pending', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith('/v1/video/create')) {
        return new Response(
          JSON.stringify({ task_id: 'task-stuck' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.startsWith('https://api.senseaudio.cn/v1/video/status')) {
        return new Response(
          JSON.stringify({ status: 'pending', progress: 0 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateVideo(
      { prompt: 'stuck job' },
      baseCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timed out/);
    // 1× create + 120× poll = 121 fetches (10-min ceiling at 5 s
    // intervals — kept generous because doubao-seedance frequently
    // spends 3–8 min on the gateway for 1080p+audio jobs).
    expect(fetchMock).toHaveBeenCalledTimes(121);
  }, 30_000);

  it('returns a tool error when create response is missing task_id', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('{"oops": true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateVideo({ prompt: 'x' }, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/missing task_id/);
  });

  it('returns a tool error when create call returns non-2xx', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('unauthorized', {
        status: 401,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateVideo({ prompt: 'x' }, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/senseaudio video create 401/);
  });

  it('rejects an unsafe projectId before any upstream call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateVideo(
      { prompt: 'x' },
      { ...baseCtx(), projectId: '../escape' },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid projectId/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects empty prompt before any upstream call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateVideo({}, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/prompt is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
