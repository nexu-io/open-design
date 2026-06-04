import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The HEAD branch's executors are thin wrappers around the unified media
// dispatcher `generateMedia`. Tests for those mock generateMedia and assert
// the delegation shape + URL/error mapping. AIHubMix executors keep their
// inline fetch implementation, so their tests stub `fetch` directly.
const { generateMediaMock } = vi.hoisted(() => ({ generateMediaMock: vi.fn() }));
vi.mock('../src/media.js', () => ({ generateMedia: generateMediaMock }));

import {
  BYOK_MEDIA_TOOLS,
  BYOK_AIHUBMIX_TOOLS,
  BYOK_AIHUBMIX_DEFAULT_VIDEO_MODEL,
  executeGenerateAudio,
  executeGenerateImage,
  executeGenerateVideo,
  executeAIHubMixGenerateImage,
  executeAIHubMixGenerateSpeech,
  executeAIHubMixGenerateVideo,
  SENSEAUDIO_DEFAULT_AUDIO_MODEL,
  SENSEAUDIO_DEFAULT_IMAGE_MODEL,
  SENSEAUDIO_DEFAULT_VIDEO_MODEL,
} from '../src/byok-tools.js';

const CTX = {
  projectRoot: '/root',
  projectsRoot: '/root/projects',
  projectId: 'proj-1',
};

beforeEach(() => {
  generateMediaMock.mockReset();
});

describe('BYOK_MEDIA_TOOLS', () => {
  it('exposes generate_image, generate_video, and generate_audio', () => {
    const names = BYOK_MEDIA_TOOLS.map((t) => t.function.name).sort();
    expect(names).toEqual(['generate_audio', 'generate_image', 'generate_video']);
  });

  it('generate_image requires prompt and offers image aspect ratios', () => {
    const tool = BYOK_MEDIA_TOOLS.find((t) => t.function.name === 'generate_image')!;
    const props = tool.function.parameters.properties as any;
    expect(tool.type).toBe('function');
    expect(tool.function.parameters.required).toEqual(['prompt']);
    expect(props.aspect_ratio.enum).toEqual(['1:1', '16:9', '9:16', '4:3', '3:4']);
  });

  it('image model enum spans the whole registry (not just SenseAudio)', () => {
    const tool = BYOK_MEDIA_TOOLS.find((t) => t.function.name === 'generate_image')!;
    const enumIds = (tool.function.parameters.properties as any).model.enum as string[];
    expect(enumIds).toContain(SENSEAUDIO_DEFAULT_IMAGE_MODEL);
    expect(enumIds).toContain('gpt-image-2'); // an OpenAI image model
  });

  it('documents that TTS prompt is spoken text only', () => {
    const tool = BYOK_MEDIA_TOOLS.find((t) => t.function.name === 'generate_audio')!;
    const props = tool.function.parameters.properties as any;
    expect(props.prompt.description).toContain('For TTS, include only the final text to speak');
    expect(props.prompt.description).toContain('Do not include language, tone, pacing, emotion, style, safety notes, or voice descriptions');
    expect(props.voice.description).toContain('Only pass this when you have a real provider voice id');
  });
});

describe('executeGenerateImage', () => {
  it('delegates to generateMedia and maps the file to a project URL', async () => {
    generateMediaMock.mockResolvedValue({ name: 'image-x.png' });
    const result = await executeGenerateImage(
      { prompt: 'a cat', aspect_ratio: '16:9' },
      { ...CTX, defaultImageModel: SENSEAUDIO_DEFAULT_IMAGE_MODEL },
    );
    expect(result).toEqual({
      ok: true,
      url: '/api/projects/proj-1/files/image-x.png',
      kind: 'image',
    });
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        surface: 'image',
        model: SENSEAUDIO_DEFAULT_IMAGE_MODEL,
        prompt: 'a cat',
        aspect: '16:9',
        // BYOK tools opt out of the stub fallback so an unconfigured model
        // errors instead of returning a placeholder that looks generated.
        allowStub: false,
      }),
    );
  });

  it('honours an explicit registry model arg over the surface fallback', async () => {
    generateMediaMock.mockResolvedValue({ name: 'o.png' });
    await executeGenerateImage(
      { prompt: 'x', model: 'gpt-image-2' },
      { ...CTX, defaultImageModel: SENSEAUDIO_DEFAULT_IMAGE_MODEL },
    );
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-image-2' }),
    );
  });

  it('uses the composer default when the LLM omits a model', async () => {
    generateMediaMock.mockResolvedValue({ name: 'p.png' });
    await executeGenerateImage(
      // No model arg → the user didn't name one → use the composer pick.
      { prompt: 'x' },
      {
        ...CTX,
        composerImageModel: 'senseaudio-image-1.0-260319',
        defaultImageModel: SENSEAUDIO_DEFAULT_IMAGE_MODEL,
      },
    );
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'senseaudio-image-1.0-260319' }),
    );
  });

  it('lets an explicit LLM model override the composer default', async () => {
    generateMediaMock.mockResolvedValue({ name: 'e.png' });
    await executeGenerateImage(
      // The user named gpt-image-2 in chat → the LLM forwards it → it wins
      // over the composer pick (senseaudio-image-1.0).
      { prompt: 'x', model: 'gpt-image-2' },
      {
        ...CTX,
        composerImageModel: 'senseaudio-image-1.0-260319',
        defaultImageModel: SENSEAUDIO_DEFAULT_IMAGE_MODEL,
      },
    );
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-image-2' }),
    );
  });

  it('falls back to the composer default for an unknown model arg', async () => {
    generateMediaMock.mockResolvedValue({ name: 'd.png' });
    await executeGenerateImage(
      { prompt: 'x', model: 'not-a-real-model' },
      { ...CTX, defaultImageModel: SENSEAUDIO_DEFAULT_IMAGE_MODEL },
    );
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: SENSEAUDIO_DEFAULT_IMAGE_MODEL }),
    );
  });

  it('requires a non-empty prompt', async () => {
    const result = await executeGenerateImage({ prompt: '   ' }, CTX);
    expect(result.ok).toBe(false);
    expect(generateMediaMock).not.toHaveBeenCalled();
  });

  it('maps a generateMedia throw to an error result', async () => {
    generateMediaMock.mockRejectedValue(new Error('no OpenAI credential'));
    const result = await executeGenerateImage({ prompt: 'x', model: 'gpt-image-2' }, CTX);
    expect(result).toEqual({ ok: false, error: 'no OpenAI credential', kind: 'image' });
  });
});

describe('executeGenerateVideo', () => {
  it('delegates with surface=video, aspect, and length', async () => {
    generateMediaMock.mockResolvedValue({ name: 'v.mp4' });
    const result = await executeGenerateVideo(
      { prompt: 'a slow pan', aspect_ratio: '9:16', duration: 8 },
      { ...CTX, defaultVideoModel: SENSEAUDIO_DEFAULT_VIDEO_MODEL },
    );
    expect(result).toEqual({
      ok: true,
      url: '/api/projects/proj-1/files/v.mp4',
      kind: 'video',
    });
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'video',
        model: SENSEAUDIO_DEFAULT_VIDEO_MODEL,
        aspect: '9:16',
        length: 8,
      }),
    );
  });

  it('clamps an out-of-range duration to the max', async () => {
    generateMediaMock.mockResolvedValue({ name: 'v.mp4' });
    await executeGenerateVideo(
      { prompt: 'x', duration: 999 },
      { ...CTX, defaultVideoModel: SENSEAUDIO_DEFAULT_VIDEO_MODEL },
    );
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ length: 30 }),
    );
  });
});

describe('executeGenerateAudio', () => {
  it('delegates with surface=audio and derives audioKind from the model', async () => {
    generateMediaMock.mockResolvedValue({ name: 'a.mp3' });
    const result = await executeGenerateAudio(
      { prompt: 'read this aloud', voice: 'female_0038_a' },
      { ...CTX, defaultAudioModel: SENSEAUDIO_DEFAULT_AUDIO_MODEL },
    );
    expect(result).toEqual({
      ok: true,
      url: '/api/projects/proj-1/files/a.mp3',
      kind: 'audio',
    });
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'audio',
        model: SENSEAUDIO_DEFAULT_AUDIO_MODEL,
        audioKind: 'speech',
        voice: 'female_0038_a',
      }),
    );
  });

  it('routes a music model with audioKind=music', async () => {
    generateMediaMock.mockResolvedValue({ name: 'm.mp3' });
    await executeGenerateAudio({ prompt: 'lofi beat', model: 'suno-v5' }, CTX);
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'audio', model: 'suno-v5', audioKind: 'music' }),
    );
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
