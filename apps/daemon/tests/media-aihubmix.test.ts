// Unit tests for the AIHubMix media adapters in media.ts plus the shared
// header/wire-name helpers in aihubmix.ts.
//
// AIHubMix is OpenAI-wire-compatible, so these tests assert:
//   1. Image generation hits /v1/images/generations with the stripped wire
//      model name (aihubmix-gpt-image-1 → gpt-image-1) and a Bearer key.
//   2. Speech generation hits /v1/audio/speech with the stripped wire name.
//   3. The APP-Code attribution invariant in aihubmixHeaders():
//      authorization is always present; APP-Code is present iff the fixed
//      AIHUBMIX_APP_CODE constant is set (so the test stays green whether or
//      not an integrator has filled it in).
//   4. aihubmixWireModel() catalogue-id → wire-name mapping.

import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';
import {
  AIHUBMIX_APP_CODE,
  AIHUBMIX_DEFAULT_BASE_URL,
  aihubmixHeaders,
  aihubmixWireModel,
  aihubmixCatalogUrl,
  parseAIHubMixCatalog,
} from '../src/aihubmix.js';

// 1×1 transparent PNG.
const FAKE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const FAKE_MP3 = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00]);

describe('aihubmix shared helpers', () => {
  it('maps prefixed catalogue ids to bare wire model names', () => {
    expect(aihubmixWireModel('aihubmix-gpt-image-1')).toBe('gpt-image-1');
    expect(aihubmixWireModel('aihubmix-dall-e-3')).toBe('dall-e-3');
    expect(aihubmixWireModel('aihubmix-tts-1')).toBe('tts-1');
    // Unknown id falls back to a plain prefix strip.
    expect(aihubmixWireModel('aihubmix-foo')).toBe('foo');
    // Already-bare id passes through.
    expect(aihubmixWireModel('gpt-4o')).toBe('gpt-4o');
  });

  it('always sends Bearer auth and injects APP-Code only when configured', () => {
    const headers = aihubmixHeaders('sk-test-key');
    expect(headers.authorization).toBe('Bearer sk-test-key');
    if (AIHUBMIX_APP_CODE) {
      expect(headers['APP-Code']).toBe(AIHUBMIX_APP_CODE);
    } else {
      expect(headers['APP-Code']).toBeUndefined();
    }
  });

  it('defaults to the aihubmix.com/v1 base url', () => {
    expect(AIHUBMIX_DEFAULT_BASE_URL).toBe('https://aihubmix.com/v1');
  });

  it('builds the live catalogue url from the base origin', () => {
    expect(aihubmixCatalogUrl('https://aihubmix.com/v1', 'llm'))
      .toBe('https://aihubmix.com/api/v1/models?type=llm');
    expect(aihubmixCatalogUrl('https://aihubmix.com/v1', 'image_generation'))
      .toBe('https://aihubmix.com/api/v1/models?type=image_generation');
  });

  it('parses the AIHubMix catalogue envelope (model_id / model_name)', () => {
    const parsed = parseAIHubMixCatalog({
      data: [
        { model_id: 'gpt-image-2', model_name: 'GPT Image 2', types: 'image_generation,llm' },
        { model_id: 'qwen-image-2.0-pro', model_name: '', types: 'image_generation' },
        { model_id: 'gpt-image-2' }, // duplicate id dropped
        { foo: 'bar' }, // no model_id dropped
      ],
    });
    expect(parsed).toEqual([
      { id: 'gpt-image-2', label: 'GPT Image 2' },
      { id: 'qwen-image-2.0-pro', label: 'qwen-image-2.0-pro' }, // falls back to id
    ]);
  });

  it('drops media-generation rows from the chat catalogue (chatOnly)', () => {
    // AIHubMix's `?type=llm` matches any model whose `types` merely CONTAINS
    // `llm`, so dual-tagged image models leak in. The chat picker must keep
    // genuine chat models only — media models have their own pickers.
    const parsed = parseAIHubMixCatalog(
      {
        data: [
          { model_id: 'claude-opus-4-8', model_name: 'Claude Opus 4.8', types: 'llm' },
          { model_id: 'qwen3.7-max', model_name: 'Qwen 3.7 Max', types: 'llm,search' },
          { model_id: 'some-ocr-llm', model_name: 'OCR LLM', types: 'llm,ocr' },
          // dual-tagged image models that pollute the chat picker today:
          { model_id: 'gpt-image-2', model_name: 'GPT Image 2', types: 'image_generation,llm' },
          { model_id: 'gemini-2.5-flash-image', model_name: 'Gemini Image', types: 'image_generation,llm' },
          // pure media rows:
          { model_id: 'qwen-image-2.0-pro', model_name: '', types: 'image_generation' },
          { model_id: 'some-video', model_name: 'Video', types: 'video' },
          { model_id: 'some-tts', model_name: 'TTS', types: 'tts' },
          // missing types metadata is kept (don't hide a valid chat model):
          { model_id: 'mystery-model', model_name: 'Mystery' },
        ],
      },
      { chatOnly: true },
    );
    expect(parsed.map((m) => m.id)).toEqual([
      'claude-opus-4-8',
      'qwen3.7-max',
      'some-ocr-llm',
      'mystery-model',
    ]);
  });
});

describe('aihubmix media generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-aihubmix-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    process.env.OD_AIHUBMIX_API_KEY = 'sk-aihubmix-test-1234';
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    delete process.env.OD_AIHUBMIX_API_KEY;
    if (originalMediaConfigDir == null) delete process.env.OD_MEDIA_CONFIG_DIR;
    else process.env.OD_MEDIA_CONFIG_DIR = originalMediaConfigDir;
    if (originalDataDir == null) delete process.env.OD_DATA_DIR;
    else process.env.OD_DATA_DIR = originalDataDir;
    await rm(root, { recursive: true, force: true });
  });

  function jsonResp(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('renders an image via /v1/images/generations with the stripped wire model', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResp({ data: [{ b64_json: FAKE_PNG.toString('base64') }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      surface: 'image',
      model: 'aihubmix-gpt-image-1',
      prompt: 'a teal fox logo, flat vector',
      aspect: '1:1',
      output: 'fox.png',
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
    });

    expect(result.providerId).toBe('aihubmix');
    expect(result.providerNote).toContain('gpt-image-1');

    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://aihubmix.com/v1/images/generations');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('gpt-image-1'); // prefix stripped
    expect(opts.headers.authorization).toBe('Bearer sk-aihubmix-test-1234');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'fox.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('renders a dynamic catalogue image id not in the static registry', async () => {
    // aihubmix-qwen-image-2.0-pro is NOT in IMAGE_MODELS — it comes from the
    // live catalogue. generateMedia must synthesize a def and strip the prefix
    // to the wire name rather than throwing "unknown model".
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResp({ data: [{ b64_json: FAKE_PNG.toString('base64') }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      surface: 'image',
      model: 'aihubmix-qwen-image-2.0-pro',
      prompt: 'a koi pond, ukiyo-e',
      aspect: '1:1',
      output: 'koi.png',
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
    });

    expect(result.providerId).toBe('aihubmix');
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://aihubmix.com/v1/images/generations');
    expect(JSON.parse(opts.body).model).toBe('qwen-image-2.0-pro');
  });

  it('routes a Gemini-family catalogue image model to the gemini generateContent wire', async () => {
    // gemini/imagen image models reject the OpenAI /images/generations shape, so
    // the media renderer must branch to the Gemini-native endpoint and read the
    // inline base64 image — mirroring the chat tool's classifyAIHubMixModel split.
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResp({
        candidates: [
          { content: { parts: [{ inlineData: { data: FAKE_PNG.toString('base64') } }] } },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      surface: 'image',
      model: 'aihubmix-gemini-2.5-flash-image',
      prompt: 'a koi pond, watercolor',
      aspect: '16:9',
      output: 'koi-gemini.png',
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
    });

    expect(result.providerId).toBe('aihubmix');
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://aihubmix.com/gemini/v1beta/models/gemini-2.5-flash-image:generateContent',
    );
    // Gemini wire uses x-goog-api-key, NOT an OpenAI Authorization bearer.
    expect(opts.headers['x-goog-api-key']).toBe('sk-aihubmix-test-1234');
    const body = JSON.parse(opts.body);
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('16:9');
    expect(body.generationConfig.responseModalities).toContain('IMAGE');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'koi-gemini.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('renders speech via /v1/audio/speech with the stripped wire model', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(FAKE_MP3, { status: 200, headers: { 'content-type': 'audio/mpeg' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      surface: 'audio',
      audioKind: 'speech',
      model: 'aihubmix-tts-1',
      prompt: 'Hello from AIHubMix.',
      output: 'vo.mp3',
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
    });

    expect(result.providerId).toBe('aihubmix');

    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://aihubmix.com/v1/audio/speech');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('tts-1');
    expect(body.input).toBe('Hello from AIHubMix.');
    expect(opts.headers.authorization).toBe('Bearer sk-aihubmix-test-1234');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'vo.mp3'));
    expect(bytes.length).toBeGreaterThan(0);
  });
});
