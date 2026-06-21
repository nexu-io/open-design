import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BYOK_SENSEAUDIO_TOOLS,
  BYOK_AIHUBMIX_TOOLS,
  BYOK_AIHUBMIX_DEFAULT_VIDEO_MODEL,
  executeGenerateImage,
  executeGenerateSpeech,
  executeGenerateVideo,
  executeAIHubMixGenerateVideo,
  executeAIHubMixGenerateImage,
  executeAIHubMixGenerateSpeech,
} from '../src/byok-tools.js';

describe('BYOK_SENSEAUDIO_TOOLS', () => {
  it('exports an OpenAI-shaped generate_image tool definition', () => {
    const tool = BYOK_SENSEAUDIO_TOOLS.find(
      (t) => t.function.name === 'generate_image',
    );
    expect(tool).toBeDefined();
    expect(tool!.type).toBe('function');
    expect(tool!.function.parameters.required).toEqual(['prompt']);
    const properties = tool!.function.parameters.properties as Record<string, any>;
    expect(properties.aspect_ratio.enum).toEqual([
      '1:1',
      '16:9',
      '9:16',
      '4:3',
      '3:4',
    ]);
  });

  it('exposes image, speech, and video tools', () => {
    const names = BYOK_SENSEAUDIO_TOOLS.map((t) => t.function.name).sort();
    expect(names).toEqual(['generate_image', 'generate_speech', 'generate_video']);
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
    const dispatcher = { dispatch: vi.fn() } as unknown as NonNullable<RequestInit['dispatcher']>;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      expect(init?.dispatcher).toBe(dispatcher);
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
      { ...baseCtx(), requestInit: { dispatcher } },
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

describe('executeGenerateSpeech', () => {
  let root: string;
  let projectsRoot: string;
  const PROJECT_ID = 'test-project';
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-byok-speech-'));
    projectsRoot = path.join(root, 'projects');
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
    await rm(root, { recursive: true, force: true });
  });

  it('calls /v1/t2a_v2, persists mp3 bytes, and returns a daemon URL', async () => {
    const audioBytes = Buffer.from([0x49, 0x44, 0x33, 0x04]);
    const dispatcher = { dispatch: vi.fn() } as unknown as NonNullable<RequestInit['dispatcher']>;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.senseaudio.cn/v1/t2a_v2');
      expect(init?.method).toBe('POST');
      expect(init?.dispatcher).toBe(dispatcher);
      expect(init?.redirect).toBe('error');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer sa-byok-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'senseaudio-tts-1.5-260319',
        text: 'Meet saddle2 — the way work was supposed to feel.',
        stream: false,
        voice_setting: {
          voice_id: 'female_0033_b',
          speed: 1,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          format: 'mp3',
          sample_rate: 32000,
          bitrate: 128000,
          channel: 2,
        },
      });
      return new Response(
        JSON.stringify({
          data: { audio: audioBytes.toString('hex') },
          base_resp: { status_code: 0, status_msg: 'success' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateSpeech(
      { text: 'Meet saddle2 — the way work was supposed to feel.' },
      {
        projectRoot: root,
        projectsRoot,
        projectId: PROJECT_ID,
        upstreamApiKey: 'sa-byok-key',
        upstreamBaseUrl: 'https://api.senseaudio.cn',
        requestInit: { dispatcher },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.url).toMatch(
      new RegExp(`^/api/projects/${PROJECT_ID}/files/byok-speech-[a-z0-9-]+\\.mp3$`),
    );

    const filename = result.url!.split('/').pop()!;
    const onDisk = await readFile(path.join(projectsRoot, PROJECT_ID, filename));
    expect(onDisk.equals(audioBytes)).toBe(true);
  });

  it('does not duplicate /v1 when the BYOK gateway base URL is already versioned', async () => {
    const audioBytes = Buffer.from([0x49, 0x44, 0x33, 0x04]);
    const fetchMock = vi.fn(async (input: unknown) => {
      expect(String(input)).toBe('https://gateway.example.com/api/v1/openai/t2a_v2');
      return new Response(
        JSON.stringify({
          data: { audio: audioBytes.toString('hex') },
          base_resp: { status_code: 0, status_msg: 'success' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateSpeech(
      { text: 'hello' },
      {
        projectRoot: root,
        projectsRoot,
        projectId: PROJECT_ID,
        upstreamApiKey: 'sa-byok-key',
        upstreamBaseUrl: 'https://gateway.example.com/api/v1/openai',
      },
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns { ok: false } when SenseAudio returns malformed JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('not json', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    );

    const result = await executeGenerateSpeech(
      { text: 'hello' },
      {
        projectRoot: root,
        projectsRoot,
        projectId: PROJECT_ID,
        upstreamApiKey: 'sa-byok-key',
        upstreamBaseUrl: 'https://api.senseaudio.cn',
      },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/senseaudio speech non-JSON/);
  });

  it('returns { ok: false } when the SenseAudio request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    const result = await executeGenerateSpeech(
      { text: 'hello' },
      {
        projectRoot: root,
        projectsRoot,
        projectId: PROJECT_ID,
        upstreamApiKey: 'sa-byok-key',
        upstreamBaseUrl: 'https://api.senseaudio.cn',
      },
    );

    expect(result).toEqual({ ok: false, error: 'network down' });
  });

  it('asks fetch to reject redirected SenseAudio TTS upstreams', async () => {
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      throw new TypeError('redirect mode is set to error');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeGenerateSpeech(
      { text: 'hello' },
      {
        projectRoot: root,
        projectsRoot,
        projectId: PROJECT_ID,
        upstreamApiKey: 'sa-byok-key',
        upstreamBaseUrl: 'https://api.senseaudio.cn',
      },
    );

    expect(result).toEqual({ ok: false, error: 'redirect mode is set to error' });
  });

  it.each(['aaZZ', 'abc'])(
    'returns { ok: false } when SenseAudio returns malformed hex audio: %s',
    async (audio) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              data: { audio },
              base_resp: { status_code: 0, status_msg: 'success' },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      );

      const result = await executeGenerateSpeech(
        { text: 'hello' },
        {
          projectRoot: root,
          projectsRoot,
          projectId: PROJECT_ID,
          upstreamApiKey: 'sa-byok-key',
          upstreamBaseUrl: 'https://api.senseaudio.cn',
        },
      );

      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/invalid hex audio/);
    },
  );
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
    const dispatcher = { dispatch: vi.fn() } as unknown as NonNullable<RequestInit['dispatcher']>;
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      expect(init?.dispatcher).toBe(dispatcher);

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
      { ...baseCtx(), requestInit: { dispatcher } },
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

describe('BYOK_AIHUBMIX_TOOLS', () => {
  it('exposes image, speech, and video tools', () => {
    const names = BYOK_AIHUBMIX_TOOLS.map((t) => t.function.name).sort();
    expect(names).toEqual(['generate_image', 'generate_speech', 'generate_video']);
  });

  it('exports an OpenAI-shaped generate_video tool definition', () => {
    const tool = BYOK_AIHUBMIX_TOOLS.find(
      (t) => t.function.name === 'generate_video',
    );
    expect(tool).toBeDefined();
    expect(tool!.type).toBe('function');
    expect(tool!.function.parameters.required).toEqual(['prompt']);
    const properties = tool!.function.parameters.properties as Record<string, any>;
    expect(properties.aspect_ratio.enum).toEqual([
      '16:9',
      '9:16',
      '1:1',
      '4:3',
      '3:4',
    ]);
  });
});

describe('executeAIHubMixGenerateVideo', () => {
  let root: string;
  let projectsRoot: string;
  const PROJECT_ID = 'test-project';
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-aihubmix-video-'));
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
    upstreamApiKey: 'ahm-byok-key',
    upstreamBaseUrl: 'https://aihubmix.com/v1',
    // Keep tests fast — 1 ms between polls instead of the production 5 s.
    videoPollIntervalMs: 1,
  });

  it('submits to /videos, polls until completed, downloads the inline url, and writes the mp4', async () => {
    const mp4Bytes = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
    const dispatcher = { dispatch: vi.fn() } as unknown as NonNullable<RequestInit['dispatcher']>;
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      expect(init?.dispatcher).toBe(dispatcher);

      if (url === 'https://aihubmix.com/v1/videos') {
        expect(init?.method).toBe('POST');
        // AIHubMix headers carry Bearer auth + the fixed APP-Code attribution.
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer ahm-byok-key',
          'content-type': 'application/json',
          'APP-Code': 'DMCY9912',
        });
        const body = JSON.parse(String(init?.body));
        // Default model is seedance → multimodal content[] shape (not flat).
        expect(body).toMatchObject({
          model: 'doubao-seedance-2-0-fast-260128', // prefix stripped to wire name
          prompt: 'a panda walking in a bamboo forest',
          duration: 8,
          ratio: '16:9',
          // Seedance wants a resolution TOKEN, not the aspect-derived 1280x720
          // pixel string (which 400s with "resolution ... not valid ... in i2v").
          resolution: '720p',
        });
        expect(body.content).toEqual([
          { type: 'text', text: 'a panda walking in a bamboo forest' },
        ]);
        return new Response(
          JSON.stringify({ id: 'vid-abc' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url === 'https://aihubmix.com/v1/videos/vid-abc') {
        pollCount++;
        if (pollCount === 1) {
          return new Response(
            JSON.stringify({ status: 'in_progress' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            status: 'completed',
            video_url: 'https://cdn.example.test/video/done.mp4',
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

    const result = await executeAIHubMixGenerateVideo(
      { prompt: 'a panda walking in a bamboo forest', aspect_ratio: '16:9', duration: 8 },
      { ...baseCtx(), requestInit: { dispatcher } },
    );

    expect(result.ok).toBe(true);
    expect(result.url).toMatch(
      new RegExp(`^/api/projects/${PROJECT_ID}/files/byok-video-[a-z0-9-]+\\.mp4$`),
    );
    // 1× submit + 2× poll + 1× download = 4 fetches total.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(pollCount).toBe(2);

    const filename = result.url!.split('/').pop()!;
    const onDisk = await readFile(path.join(projectsRoot, PROJECT_ID, filename));
    expect(onDisk.equals(mp4Bytes)).toBe(true);
  });

  it('sends AIHubMix auth headers when the inline download url is same-origin (regression: 401)', async () => {
    const mp4Bytes = Buffer.from([0xaa, 0xbb]);
    let downloadHeaders: any = null;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        return new Response(JSON.stringify({ id: 'v-auth' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://aihubmix.com/v1/videos/v-auth') {
        return new Response(
          JSON.stringify({
            status: 'completed',
            // completed-video URL on the AIHubMix origin → needs auth
            video_url: 'https://aihubmix.com/v1/videos/v-auth/file.mp4',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === 'https://aihubmix.com/v1/videos/v-auth/file.mp4') {
        downloadHeaders = init?.headers;
        // Without auth the gateway 401s; the executor must send the key.
        const auth = (init?.headers as any)?.authorization;
        if (auth !== 'Bearer ahm-byok-key') {
          return new Response('unauthorized', { status: 401 });
        }
        return new Response(mp4Bytes, { status: 200, headers: { 'content-type': 'video/mp4' } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateVideo({ prompt: 'clip' }, baseCtx());
    expect(result.ok).toBe(true);
    expect(downloadHeaders).toMatchObject({
      authorization: 'Bearer ahm-byok-key',
      'APP-Code': 'DMCY9912',
    });
    const filename = result.url!.split('/').pop()!;
    const onDisk = await readFile(path.join(projectsRoot, PROJECT_ID, filename));
    expect(onDisk.equals(mp4Bytes)).toBe(true);
  });

  it('does NOT send the api key to a third-party (cross-origin) cdn download url', async () => {
    let cdnHeaders: any = 'unset';
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        return new Response(JSON.stringify({ id: 'v-cdn' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://aihubmix.com/v1/videos/v-cdn') {
        return new Response(
          JSON.stringify({ status: 'completed', video_url: 'https://cdn.example.test/signed.mp4' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === 'https://cdn.example.test/signed.mp4') {
        cdnHeaders = init?.headers ?? {};
        return new Response(Buffer.from([0x01]), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateVideo({ prompt: 'clip' }, baseCtx());
    expect(result.ok).toBe(true);
    // No Authorization leaked to the third-party CDN.
    expect((cdnHeaders as any)?.authorization).toBeUndefined();
    expect((cdnHeaders as any)?.['APP-Code']).toBeUndefined();
  });

  it('falls back to the /videos/{id}/content download when no inline url is returned', async () => {
    const mp4Bytes = Buffer.from([0x11, 0x22, 0x33]);
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        return new Response(JSON.stringify({ id: 'vid-content' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://aihubmix.com/v1/videos/vid-content') {
        return new Response(JSON.stringify({ status: 'succeeded' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://aihubmix.com/v1/videos/vid-content/content') {
        return new Response(mp4Bytes, { status: 200, headers: { 'content-type': 'video/mp4' } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateVideo({ prompt: 'clip' }, baseCtx());
    expect(result.ok).toBe(true);
    const filename = result.url!.split('/').pop()!;
    const onDisk = await readFile(path.join(projectsRoot, PROJECT_ID, filename));
    expect(onDisk.equals(mp4Bytes)).toBe(true);
  });

  it('honours an aihubmix- prefixed model override (wire name stripped)', async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        const body = JSON.parse(String(init?.body));
        expect(body.model).toBe('my-video-model');
        return new Response(JSON.stringify({ id: 'v1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://aihubmix.com/v1/videos/v1') {
        return new Response(
          JSON.stringify({ status: 'completed', url: 'https://cdn.example.test/v.mp4' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(Buffer.from([0x01]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateVideo(
      { prompt: 'clip', model: 'aihubmix-my-video-model' },
      baseCtx(),
    );
    expect(result.ok).toBe(true);
  });

  it('defaults to BYOK_AIHUBMIX_DEFAULT_VIDEO_MODEL when no model is supplied', async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        const body = JSON.parse(String(init?.body));
        expect(body.model).toBe(
          BYOK_AIHUBMIX_DEFAULT_VIDEO_MODEL.replace(/^aihubmix-/, ''),
        );
        return new Response(JSON.stringify({ id: 'v1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ status: 'completed', url: 'https://cdn.example.test/v.mp4' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateVideo({ prompt: 'clip' }, baseCtx());
    expect(result.ok).toBe(true);
  });

  it('composer/Settings model wins over the LLM args.model (regression)', async () => {
    let submitBody: any = null;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        submitBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ id: 'v1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ status: 'completed', url: 'https://cdn.example.test/v.mp4' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    // User picked seedance in the composer; the LLM tries to override with veo.
    const result = await executeAIHubMixGenerateVideo(
      { prompt: 'clip', model: 'aihubmix-veo-3.1-generate-preview' },
      { ...baseCtx(), defaultVideoModel: 'aihubmix-doubao-seedance-2-0-260128' },
    );
    expect(result.ok).toBe(true);
    expect(submitBody.model).toBe('doubao-seedance-2-0-260128'); // composer wins, not veo
  });

  it('returns { ok: false } on missing prompt before any fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeAIHubMixGenerateVideo({}, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/prompt is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Per-family duration snapping (regression: Veo 400 "durationSeconds out of
  // bound" because AIHubMix's unified `seconds` only takes 4/6/8 for Veo).
  it.each([
    // veo family sends seconds as a NUMBER (Gemini predictLongRunning shim);
    // sora (generic family) keeps the string shape it expects.
    ['aihubmix-veo-3.1-lite-generate-preview', 5, 4], // veo 4/6/8, 5→nearest (tie→shorter)
    ['aihubmix-veo-3.1-lite-generate-preview', 7, 6], // veo, 7→6 (tie→shorter)
    ['aihubmix-veo-3.1-lite-generate-preview', 10, 8], // veo, clamp to 8
    ['aihubmix-sora-2', 5, '4'], // sora 4/8/12
    ['aihubmix-sora-2', 11, '12'], // sora, 11→12
    // (seedance uses `duration` not `seconds` — covered by media-adapters.test)
  ])('snaps seconds to the model family allowed set (%s, %d → %s)', async (model, duration, expected) => {
    let submitBody: any = null;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        submitBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ id: 'vd' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ status: 'completed', url: 'https://cdn.example.test/v.mp4' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateVideo(
      { prompt: 'clip', model, duration },
      baseCtx(),
    );
    expect(result.ok).toBe(true);
    expect(submitBody.seconds).toBe(expected);
  });

  it('i2v (wan family): sends the reference image as first_frame in input.media', async () => {
    // Seed a project-local reference image.
    const refDir = path.join(projectsRoot, PROJECT_ID);
    await mkdir(refDir, { recursive: true });
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await writeFile(path.join(refDir, 'ref.png'), pngBytes);

    let submitBody: any = null;
    let submitContentType: string | null = null;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        // happyhorse/wan i2v is the DashScope wanx wire: JSON with the reference
        // image as first_frame under input.media (NOT a flat input_reference).
        submitContentType =
          (init?.headers as Record<string, string> | undefined)?.['content-type'] ?? null;
        submitBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ id: 'v-i2v' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://aihubmix.com/v1/videos/v-i2v') {
        return new Response(
          JSON.stringify({ status: 'completed', url: 'https://cdn.example.test/v.mp4' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(Buffer.from([0x01]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateVideo(
      {
        prompt: 'animate the panda',
        model: 'aihubmix-happyhorse-1.0-i2v',
        image_url: '/api/projects/test-project/files/ref.png',
      },
      baseCtx(),
    );
    expect(result.ok).toBe(true);
    expect(submitContentType).toBe('application/json');
    expect(submitBody.model).toBe('happyhorse-1.0-i2v');
    // wanx wire: prompt + first_frame live under input.{prompt,media}; the old
    // flat top-level prompt / input_reference must NOT be present.
    expect(submitBody.prompt).toBeUndefined();
    expect(submitBody.input_reference).toBeUndefined();
    expect(submitBody.input.prompt).toBe('animate the panda');
    expect(submitBody.input.media[0].type).toBe('first_frame');
    expect(submitBody.input.media[0].url).toMatch(/^data:image\/png;base64,/);
    expect(submitBody.input.media[0].url).toContain(pngBytes.toString('base64'));
    expect(submitBody.parameters.resolution).toBe('720P');
  });

  it('i2v: falls back to the newest project image when image_url is omitted', async () => {
    const refDir = path.join(projectsRoot, PROJECT_ID);
    await mkdir(refDir, { recursive: true });
    await writeFile(path.join(refDir, 'newest.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    let submitBody: any = null;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        submitBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ id: 'v-i2v2' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://aihubmix.com/v1/videos/v-i2v2') {
        return new Response(
          JSON.stringify({ status: 'completed', url: 'https://cdn.example.test/v.mp4' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(Buffer.from([0x01]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateVideo(
      { prompt: 'animate', model: 'aihubmix-happyhorse-1.0-i2v' },
      baseCtx(),
    );
    expect(result.ok).toBe(true);
    expect(submitBody.input.media[0].type).toBe('first_frame');
    expect(submitBody.input.media[0].url).toMatch(/^data:image\/png;base64,/);
  });

  it('i2v model: clear error (no upstream call) when no reference image exists', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeAIHubMixGenerateVideo(
      { prompt: 'animate', model: 'aihubmix-happyhorse-1.0-i2v' },
      baseCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/image-to-video model and needs a reference image/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('t2v model: does not attach input_reference even if a project image exists', async () => {
    const refDir = path.join(projectsRoot, PROJECT_ID);
    await mkdir(refDir, { recursive: true });
    await writeFile(path.join(refDir, 'stray.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    let submitBody: any = null;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        submitBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ id: 'v-t2v' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://aihubmix.com/v1/videos/v-t2v') {
        return new Response(
          JSON.stringify({ status: 'completed', url: 'https://cdn.example.test/v.mp4' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(Buffer.from([0x01]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateVideo(
      { prompt: 'a sunset', model: 'aihubmix-doubao-seedance-2-0-260128' },
      baseCtx(),
    );
    expect(result.ok).toBe(true);
    expect(submitBody.input_reference).toBeUndefined();
  });

  // Regression: the Gemini predictLongRunning shim 400s with
  // "`inlineData`/`referenceImages` isn't supported by this model" when ANY veo
  // variant is handed a reference (verified by probing data-URL/public-URL/object
  // forms against both). We catch it before the upstream call and tell the user
  // how to recover. Veo is text-to-video only here — including the non-lite one.
  it.each([
    'aihubmix-veo-3.1-lite-generate-preview',
    'aihubmix-veo-3.1-generate-preview',
  ])('veo (t2v-only): %s rejects a reference image with an actionable error, no upstream call', async (model) => {
    const refDir = path.join(projectsRoot, PROJECT_ID);
    await mkdir(refDir, { recursive: true });
    await writeFile(path.join(refDir, 'ref.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateVideo(
      { prompt: 'animate this', model, image_url: '/api/projects/test-project/files/ref.png' },
      baseCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/text-to-video model and can't take a reference image/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns { ok: false } when no API key is available, before any fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeAIHubMixGenerateVideo(
      { prompt: 'clip' },
      { ...baseCtx(), upstreamApiKey: '' },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no AIHubMix API key/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a failed task status', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        return new Response(JSON.stringify({ id: 'v-fail' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ status: 'failed', error: { message: 'content policy' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeAIHubMixGenerateVideo({ prompt: 'clip' }, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/aihubmix video failed: content policy/);
  });

  it('detects "params ignored" (prompt echoed empty + generic error) and returns an actionable unsupported-model message', async () => {
    // Reproduces the happyhorse-* signature: AIHubMix accepts the request but
    // doesn't map our fields onto the model — the failed body echoes prompt:""
    // and only the catch-all "Video generation failed".
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        return new Response(JSON.stringify({ id: 'v-hh' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          status: 'failed',
          prompt: '',
          width: 1920,
          height: 1080,
          duration: 5,
          error: { message: 'Video generation failed', type: 'video_generation_error' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    // happyhorse-1.0-t2v is not an i2v id, so no reference image is required.
    const result = await executeAIHubMixGenerateVideo(
      { prompt: 'a panda walking', model: 'aihubmix-happyhorse-1.0-t2v' },
      baseCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not supported by AIHubMix's unified video API/);
    expect(result.error).toMatch(/doubao-seedance/);
  });

  it('i2v with reference: "params dropped" maps to an image-not-accepted message, not generic unsupported', async () => {
    // Seed a reference image so the i2v guard passes and a multipart submit runs.
    const refDir = path.join(projectsRoot, PROJECT_ID);
    await mkdir(refDir, { recursive: true });
    await writeFile(path.join(refDir, 'ref.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        return new Response(JSON.stringify({ id: 'v-hh-i2v' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          status: 'failed',
          prompt: '',
          width: 1920,
          height: 1080,
          error: { message: 'Video generation failed', type: 'video_generation_error' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeAIHubMixGenerateVideo(
      { prompt: 'animate the panda', model: 'aihubmix-happyhorse-1.0-i2v' },
      baseCtx(),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/did not accept the reference image/);
    expect(result.error).toMatch(/publicly reachable image URL/);
    expect(result.error).toMatch(/doubao-seedance/);
    expect(result.error).toMatch(/happyhorse-1\.0-t2v may still work/);
  });

  it('preserves a specific failure reason even when prompt is echoed empty', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        return new Response(JSON.stringify({ id: 'v-spec' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          status: 'failed',
          prompt: '',
          error: { message: 'input image may contain real person' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeAIHubMixGenerateVideo(
      { prompt: 'clip', model: 'aihubmix-happyhorse-1.0-t2v' },
      baseCtx(),
    );
    expect(result.ok).toBe(false);
    // Real reason wins; the unsupported-model hint must NOT mask it.
    expect(result.error).toMatch(/real person/);
    expect(result.error).not.toMatch(/not supported by AIHubMix/);
  });

  it('surfaces HTTP submit failures with status and truncated body', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('upstream boom', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeAIHubMixGenerateVideo({ prompt: 'clip' }, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/aihubmix video submit 500/);
  });

  it('rejects an SSRF-y inline video url (metadata service) without downloading', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/videos') {
        return new Response(JSON.stringify({ id: 'v-ssrf' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://aihubmix.com/v1/videos/v-ssrf') {
        return new Response(
          JSON.stringify({ status: 'completed', video_url: 'http://169.254.169.254/latest/meta-data/' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeAIHubMixGenerateVideo({ prompt: 'clip' }, baseCtx());
    expect(result.ok).toBe(false);
  });
});

describe('executeAIHubMixGenerateImage', () => {
  let root: string;
  let projectsRoot: string;
  const PROJECT_ID = 'test-project';
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-aihubmix-image-'));
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
    upstreamApiKey: 'ahm-byok-key',
    upstreamBaseUrl: 'https://aihubmix.com/v1',
  });

  it('composer/Settings image model wins over the LLM args.model (regression)', async () => {
    let submitBody: any = null;
    const pngB64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/images/generations') {
        submitBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ data: [{ b64_json: pngB64 }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    // User picked qwen in the composer; the LLM tries to override with gpt-image-1.
    const result = await executeAIHubMixGenerateImage(
      { prompt: 'a chart', model: 'aihubmix-gpt-image-1' },
      { ...baseCtx(), defaultImageModel: 'aihubmix-qwen-image-2.0-pro' },
    );
    expect(result.ok).toBe(true);
    expect(submitBody.model).toBe('qwen-image-2.0-pro'); // composer wins, not gpt-image-1
  });

  it('speech: composer model wins over LLM arg; composer voice is the default', async () => {
    let submitBody: any = null;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://aihubmix.com/v1/audio/speech') {
        submitBody = JSON.parse(String(init?.body));
        return new Response(Buffer.from([0x49, 0x44, 0x33]), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateSpeech(
      { text: 'hello there', model: 'aihubmix-tts-1' }, // LLM tries tts-1
      { ...baseCtx(), defaultSpeechModel: 'aihubmix-gpt-4o-mini-tts', defaultSpeechVoice: 'nova' },
    );
    expect(result.ok).toBe(true);
    expect(submitBody.model).toBe('gpt-4o-mini-tts'); // composer model wins
    expect(submitBody.voice).toBe('nova'); // composer voice default (no per-call voice_id)
    expect(submitBody.input).toBe('hello there');
  });

  it('speech: explicit voice_id overrides the composer voice default', async () => {
    let submitBody: any = null;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      if (String(input) === 'https://aihubmix.com/v1/audio/speech') {
        submitBody = JSON.parse(String(init?.body));
        return new Response(Buffer.from([0x49, 0x44, 0x33]), { status: 200 });
      }
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeAIHubMixGenerateSpeech(
      { text: 'hi', voice_id: 'shimmer' },
      { ...baseCtx(), defaultSpeechVoice: 'nova' },
    );
    expect(result.ok).toBe(true);
    expect(submitBody.voice).toBe('shimmer'); // per-call voice beats composer default
  });

  it('gemini TTS routes to generateContent (AUDIO modality) and wraps PCM as WAV', async () => {
    // 4 bytes of fake L16 PCM, returned base64 with an L16 mime type.
    const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    let calledUrl = '';
    let submitBody: any = null;
    let headers: any = null;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      calledUrl = String(input);
      headers = init?.headers;
      submitBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          candidates: [{
            content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: pcm.toString('base64') } }] },
          }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateSpeech(
      { text: 'hello', voice_id: 'Kore', model: 'aihubmix-gemini-2.5-flash-preview-tts' },
      baseCtx(),
    );
    expect(result.ok).toBe(true);
    expect(calledUrl).toBe(
      'https://aihubmix.com/gemini/v1beta/models/gemini-2.5-flash-preview-tts:generateContent',
    );
    expect((headers as Record<string, string>)['x-goog-api-key']).toBe('ahm-byok-key');
    expect(submitBody.generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(submitBody.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore');
    // Saved as a .wav whose RIFF/WAVE header wraps the PCM bytes.
    expect(result.url).toMatch(/\.wav$/);
    const onDisk = await readFile(path.join(projectsRoot, PROJECT_ID, result.url!.split('/').pop()!));
    expect(onDisk.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(onDisk.subarray(8, 12).toString('latin1')).toBe('WAVE');
    expect(onDisk.subarray(44).equals(pcm)).toBe(true); // PCM payload after 44-byte header
  });

  it('gemini TTS: a non-gemini voice falls back to the default gemini voice', async () => {
    let submitBody: any = null;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      submitBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: 'AAAA' } }] } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeAIHubMixGenerateSpeech(
      { text: 'hi', voice_id: 'alloy', model: 'aihubmix-gemini-2.5-flash-preview-tts' },
      baseCtx(),
    );
    expect(result.ok).toBe(true);
    expect(submitBody.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore');
  });

  it('gemini image model routes to the Gemini-native generateContent endpoint', async () => {
    const pngB64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).toString('base64');
    let calledUrl = '';
    let submitBody: any = null;
    let headers: any = null;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      calledUrl = String(input);
      headers = init?.headers;
      submitBody = JSON.parse(String(init?.body));
      // Gemini generateContent returns the image inline as base64.
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: pngB64 } }] } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeAIHubMixGenerateImage(
      { prompt: 'a chart', aspect_ratio: '16:9', model: 'aihubmix-gemini-3.1-flash-image-preview' },
      baseCtx(),
    );
    expect(result.ok).toBe(true);
    // Hit the Gemini-native endpoint, NOT /v1/images/generations.
    expect(calledUrl).toBe(
      'https://aihubmix.com/gemini/v1beta/models/gemini-3.1-flash-image-preview:generateContent',
    );
    expect(calledUrl).not.toContain('/images/generations');
    // Gemini auth header + responseModalities body shape.
    expect((headers as Record<string, string>)['x-goog-api-key']).toBe('ahm-byok-key');
    expect(submitBody.generationConfig.responseModalities).toEqual(['TEXT', 'IMAGE']);
    expect(submitBody.generationConfig.imageConfig.aspectRatio).toBe('16:9');
    expect(submitBody.contents[0].parts[0].text).toBe('a chart');
    // Decoded the inline base64 into the saved file.
    const filename = result.url!.split('/').pop()!;
    const onDisk = await readFile(path.join(projectsRoot, PROJECT_ID, filename));
    expect(onDisk.equals(Buffer.from(pngB64, 'base64'))).toBe(true);
  });
});
