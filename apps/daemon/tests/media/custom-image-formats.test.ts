// Unit tests for the custom-image provider's wire-format switch in
// media/index.ts. The daemon ships three request builders behind the
// provider's `format` field:
//   * openai-images (default) — POST {base}/images/generations
//   * gemini-native           — POST {base}/v1beta/models/{model}:generateContent
//   * openai-chat             — POST {base}/chat/completions (modalities)
// These mock global fetch and assert the exact request shape each format
// puts on the wire plus the response field the bytes are read from.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../../src/media/index.js';

// 1x1 transparent PNG — enough for sniffImageExt to pick .png.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const BASE_URL = 'http://relay.example.test';
const WIRE_MODEL = 'gemini-3.1-flash-image';

describe('custom-image wire formats', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-custom-image-format-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(root, 'projects');
    await mkdir(projectsRoot, { recursive: true });
    vi.stubEnv('OD_MEDIA_CONFIG_DIR', root);
    vi.stubEnv('OD_CUSTOM_IMAGE_API_KEY', '');
    vi.stubEnv('CUSTOM_IMAGE_API_KEY', '');
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    globalThis.fetch = realFetch;
    await rm(root, { recursive: true, force: true });
  });

  async function writeCustomImageConfig(format?: string) {
    const file = path.join(root, 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        providers: {
          'custom-image': {
            apiKey: 'relay-key',
            baseUrl: BASE_URL,
            model: WIRE_MODEL,
            ...(format ? { format } : {}),
          },
        },
      }),
      'utf8',
    );
  }

  function argsWithPaths() {
    return {
      surface: 'image' as const,
      model: 'custom-image',
      prompt: 'A red apple on a white table',
      aspect: '1:1',
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
    };
  }

  function jsonResp(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('defaults to the OpenAI images shape when no format is stored', async () => {
    await writeCustomImageConfig();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResp({ data: [{ b64_json: TINY_PNG.toString('base64') }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia(argsWithPaths());

    expect(result.providerId).toBe('custom-image');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/images/generations`);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      prompt: 'A red apple on a white table',
      model: WIRE_MODEL,
      n: 1,
      size: '1024x1024',
    });
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer relay-key');
    expect(result.name.endsWith('.png')).toBe(true);
  });

  it('speaks the Gemini native shape for format=gemini-native', async () => {
    await writeCustomImageConfig('gemini-native');
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResp({
        candidates: [
          { content: { parts: [{ inlineData: { data: TINY_PNG.toString('base64') } }] } },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia(argsWithPaths());

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/v1beta/models/${encodeURIComponent(WIRE_MODEL)}:generateContent`);
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      contents: [{ parts: [{ text: 'A red apple on a white table' }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '1:1', imageSize: '1K' },
      },
    });
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer relay-key');
    expect(result.providerNote).toContain('gemini-native');
    expect(result.name.endsWith('.png')).toBe(true);
  });

  it('uses x-goog-api-key against the official Google host', async () => {
    const file = path.join(root, 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        providers: {
          'custom-image': {
            apiKey: 'google-key',
            baseUrl: 'https://generativelanguage.googleapis.com',
            model: WIRE_MODEL,
            format: 'gemini-native',
          },
        },
      }),
      'utf8',
    );
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResp({
        candidates: [
          { content: { parts: [{ inlineData: { data: TINY_PNG.toString('base64') } }] } },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia(argsWithPaths());

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('google-key');
    expect(headers.authorization).toBeUndefined();
  });

  it('speaks the chat-completions image shape for format=openai-chat', async () => {
    await writeCustomImageConfig('openai-chat');
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResp({
        choices: [
          {
            message: {
              images: [
                { image_url: { url: `data:image/png;base64,${TINY_PNG.toString('base64')}` } },
              ],
            },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia(argsWithPaths());

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/chat/completions`);
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      model: WIRE_MODEL,
      messages: [{ role: 'user', content: 'A red apple on a white table' }],
      modalities: ['image', 'text'],
      stream: false,
      image_config: { aspect_ratio: '1:1', image_size: '1K' },
    });
    // OpenRouter-only attribution headers must not leak onto a relay call.
    const headers = init.headers as Record<string, string>;
    expect(headers['HTTP-Referer']).toBeUndefined();
    expect(headers['X-Title']).toBeUndefined();
    expect(result.providerNote).toContain('openai-chat');
    expect(result.name.endsWith('.png')).toBe(true);
  });

  it.each(['gemini-native', 'openai-chat'])('rejects image-to-image edits for %s', async (format) => {
    await writeCustomImageConfig(format);
    const refPath = path.join(projectsRoot, 'project-1', 'ref.png');
    await mkdir(path.dirname(refPath), { recursive: true });
    await writeFile(refPath, TINY_PNG);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        ...argsWithPaths(),
        image: refPath,
      }),
    ).rejects.toThrow(/openai-images format/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
