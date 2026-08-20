import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../../src/media/index.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';
const VIDEO_BASE64 = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]).toString('base64');
const OPENAI_ENV_KEYS = [
  'OD_OPENAI_API_KEY',
  'OPENAI_API_KEY',
  'AZURE_API_KEY',
  'AZURE_OPENAI_API_KEY',
];

describe('OpenAI-compatible media providers', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalImageRouterKey = process.env.OD_IMAGEROUTER_API_KEY;
  const originalCustomImageKey = process.env.OD_CUSTOM_IMAGE_API_KEY;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;
  const originalEnvAliases = process.env.OD_MEDIA_MODEL_ALIASES;
  const originalAllowStubs = process.env.OD_MEDIA_ALLOW_STUBS;
  const originalOpenAIEnv = Object.fromEntries(
    OPENAI_ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-openai-compatible-media-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_IMAGEROUTER_API_KEY;
    delete process.env.OD_CUSTOM_IMAGE_API_KEY;
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_MEDIA_MODEL_ALIASES;
    delete process.env.OD_MEDIA_ALLOW_STUBS;
    for (const key of OPENAI_ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
    if (originalImageRouterKey == null) {
      delete process.env.OD_IMAGEROUTER_API_KEY;
    } else {
      process.env.OD_IMAGEROUTER_API_KEY = originalImageRouterKey;
    }
    if (originalCustomImageKey == null) {
      delete process.env.OD_CUSTOM_IMAGE_API_KEY;
    } else {
      process.env.OD_CUSTOM_IMAGE_API_KEY = originalCustomImageKey;
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
    if (originalEnvAliases == null) {
      delete process.env.OD_MEDIA_MODEL_ALIASES;
    } else {
      process.env.OD_MEDIA_MODEL_ALIASES = originalEnvAliases;
    }
    if (originalAllowStubs == null) {
      delete process.env.OD_MEDIA_ALLOW_STUBS;
    } else {
      process.env.OD_MEDIA_ALLOW_STUBS = originalAllowStubs;
    }
    for (const key of OPENAI_ENV_KEYS) {
      if (originalOpenAIEnv[key] == null) {
        delete process.env[key];
      } else {
        process.env[key] = originalOpenAIEnv[key];
      }
    }
    await rm(root, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  it('renders custom /v1/images/generations providers with configured base URL and model', async () => {
    await writeConfig({
      providers: {
        'custom-image': {
          baseUrl: 'https://images.example.test/v1',
          model: 'acme-image-model',
        },
      },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://images.example.test/v1/images/generations');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'content-type': 'application/json',
      });
      expect(init?.headers).not.toHaveProperty('authorization');
      expect(JSON.parse(String(init?.body))).toEqual({
        prompt: 'A product render on white seamless paper',
        model: 'acme-image-model',
        n: 1,
        size: '1024x1024',
      });
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_BASE64 }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'custom-image',
      prompt: 'A product render on white seamless paper',
      output: 'custom.png',
    });

    expect(result.providerId).toBe('custom-image');
    expect(result.providerNote).toContain('custom-image/acme-image-model');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'custom.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('retries a temporarily unavailable custom-image request with the same provider', async () => {
    await writeConfig({
      providers: {
        'custom-image': {
          baseUrl: 'https://images.example.test/v1',
          model: 'acme-image-model',
        },
      },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://images.example.test/v1/images/generations');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        prompt: 'A product render on white seamless paper',
        model: 'acme-image-model',
      });
      if (fetchMock.mock.calls.length === 1) {
        return new Response(JSON.stringify({ error: { message: 'try again' } }), {
          status: 503,
          headers: {
            'content-type': 'application/json',
            'retry-after': '0',
          },
        });
      }
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_BASE64 }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onProviderRequestSettled = vi.fn();

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'custom-image',
      prompt: 'A product render on white seamless paper',
      output: 'custom-retried.png',
      onProviderRequestSettled,
    });

    expect(result.providerId).toBe('custom-image');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onProviderRequestSettled).toHaveBeenCalledOnce();
    expect(onProviderRequestSettled).toHaveBeenCalledWith({
      providerId: 'custom-image',
      attemptCount: 2,
      retryCount: 1,
      initialResponseStatus: 503,
      responseStatus: 200,
      retryReason: 'service_unavailable_503',
      retryAfterMs: 0,
      retryDelayMs: 0,
      retryFinalResult: 'success',
    });
  });

  it('forwards requestInit.dispatcher through custom-image submit and asset fetches', async () => {
    await writeConfig({
      providers: {
        'custom-image': {
          baseUrl: 'https://images.example.test/v1',
          model: 'acme-image-model',
        },
      },
    });

    const dispatcher = {} as NonNullable<RequestInit['dispatcher']>;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      if (String(input) === 'https://images.example.test/v1/images/generations') {
        expect(init?.dispatcher).toBe(dispatcher);
        return new Response(JSON.stringify({
          data: [{ url: 'https://93.184.216.34/generated.png' }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      expect(String(input)).toBe('https://93.184.216.34/generated.png');
      expect(init?.dispatcher).toBe(dispatcher);
      return new Response(Buffer.from(PNG_BASE64, 'base64'));
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'custom-image',
      prompt: 'A product render on white seamless paper',
      output: 'custom-dispatcher.png',
      requestInit: { dispatcher },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not resubmit custom-image generation when the returned asset download fails', async () => {
    await writeConfig({
      providers: {
        'custom-image': {
          baseUrl: 'https://images.example.test/v1',
          model: 'acme-image-model',
        },
      },
    });

    let submitCalls = 0;
    const fetchMock = vi.fn(async (input: unknown) => {
      if (String(input) === 'https://images.example.test/v1/images/generations') {
        submitCalls += 1;
        return new Response(JSON.stringify({
          data: [{ url: 'https://93.184.216.34/generated.png' }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      expect(String(input)).toBe('https://93.184.216.34/generated.png');
      return new Response('temporarily unavailable', { status: 503 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'custom-image',
      prompt: 'A product render on white seamless paper',
      output: 'custom-download-failure.png',
    })).rejects.toThrow('custom image media fetch 503');

    expect(submitCalls).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('routes matching OpenAI image catalog ids through the configured custom provider', async () => {
    await writeConfig({
      providers: {
        'custom-image': {
          apiKey: 'proxy-test-key',
          baseUrl: 'https://proxy.example.test/v1/images/generations',
          model: 'gpt-image-2',
        },
      },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://proxy.example.test/v1/images/generations');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer proxy-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        prompt: 'A clean app icon with glass material',
        model: 'gpt-image-2',
        n: 1,
        size: '1024x1024',
      });
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_BASE64 }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'A clean app icon with glass material',
      output: 'proxy.png',
    });

    expect(result.providerId).toBe('custom-image');
    expect(result.providerNote).toContain('custom-image/gpt-image-2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rewrites custom-image text-only requests back to /v1/images/generations when configured with an edits URL', async () => {
    await writeConfig({
      providers: {
        'custom-image': {
          apiKey: 'proxy-test-key',
          baseUrl: 'https://proxy.example.test/v1/images/edits',
          model: 'acme-image-model',
        },
      },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://proxy.example.test/v1/images/generations');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer proxy-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        prompt: 'A matte product shot on a neutral backdrop',
        model: 'acme-image-model',
        n: 1,
        size: '1024x1024',
      });
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_BASE64 }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'custom-image',
      prompt: 'A matte product shot on a neutral backdrop',
      output: 'custom-from-edits-base.png',
    });

    expect(result.providerId).toBe('custom-image');
    expect(result.providerNote).toContain('custom-image/acme-image-model');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('routes custom-image reference-image requests through /v1/images/edits', async () => {
    await writeConfig({
      providers: {
        'custom-image': {
          apiKey: 'proxy-test-key',
          baseUrl: 'https://proxy.example.test/v1',
          model: 'acme-image-edit-model',
        },
      },
    });
    const projectDir = path.join(projectsRoot, 'project-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      path.join(projectDir, 'reference.png'),
      Buffer.from(PNG_BASE64, 'base64'),
    );

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://proxy.example.test/v1/images/edits');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer proxy-test-key',
        'content-type': 'application/json',
      });
      const body = JSON.parse(String(init?.body));
      expect(body.prompt).toBe('Turn this reference into a blueprint-style UI illustration');
      expect(body.model).toBe('acme-image-edit-model');
      expect(body.n).toBe(1);
      expect(body.size).toBe('1024x1024');
      expect(body.response_format).toBe('b64_json');
      expect(body.images).toHaveLength(1);
      expect(body.images[0]?.image_url).toMatch(/^data:image\/png;base64,/);
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_BASE64 }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'custom-image',
      prompt: 'Turn this reference into a blueprint-style UI illustration',
      image: 'reference.png',
      output: 'edited.png',
    });

    expect(result.providerId).toBe('custom-image');
    expect(result.providerNote).toContain('custom-image/acme-image-edit-model');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const bytes = await readFile(path.join(projectDir, 'edited.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('renders ImageRouter images through the OpenAI-compatible JSON endpoint', async () => {
    process.env.OD_IMAGEROUTER_API_KEY = 'ir-test-key';

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.imagerouter.io/v1/openai/images/generations');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer ir-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        prompt: 'A cinematic vertical poster',
        model: 'openai/gpt-image-2',
        quality: 'auto',
        size: '576x1024',
        response_format: 'b64_json',
        output_format: 'png',
      });
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_BASE64 }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'openai/gpt-image-2',
      prompt: 'A cinematic vertical poster',
      aspect: '9:16',
      output: 'imagerouter.png',
    });

    expect(result.providerId).toBe('imagerouter');
    expect(result.providerNote).toContain('imagerouter/openai/gpt-image-2');
  });

  it('renders ImageRouter videos through the OpenAI-compatible JSON endpoint', async () => {
    process.env.OD_IMAGEROUTER_API_KEY = 'ir-test-key';

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.imagerouter.io/v1/openai/videos/generations');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer ir-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        prompt: 'A short cinematic camera push through a neon market',
        model: 'xAI/grok-imagine-video',
        size: '1024x576',
        seconds: 8,
        response_format: 'b64_json',
      });
      return new Response(JSON.stringify({
        data: [{ b64_json: VIDEO_BASE64 }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'xAI/grok-imagine-video',
      prompt: 'A short cinematic camera push through a neon market',
      aspect: '16:9',
      length: 8,
      output: 'imagerouter.mp4',
    });

    expect(result.providerId).toBe('imagerouter');
    expect(result.name).toBe('imagerouter.mp4');
    expect(result.providerNote).toContain('imagerouter/xAI/grok-imagine-video');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'imagerouter.mp4'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('keeps aliased gpt-image-2 on the explicit OpenAI API path', async () => {
    process.env.OPENAI_API_KEY = 'sk-openai-test-key';
    process.env.OD_MEDIA_MODEL_ALIASES = JSON.stringify({
      'gpt-image-2': 'custom-gpt-image-2-deployment',
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.openai.com/v1/images/generations');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer sk-openai-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        prompt: 'A clean app icon with glass material',
        model: 'custom-gpt-image-2-deployment',
      });
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_BASE64 }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'A clean app icon with glass material',
      output: 'aliased-openai.png',
    });

    expect(result.providerId).toBe('openai');
    expect(result.providerNote).toContain('openai/custom-gpt-image-2-deployment');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

});
