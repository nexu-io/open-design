import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media/index.js';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';
const SEEDREAM_5_PRO_MODEL_ID = 'doubao-seedream-5-0-pro-260628';

describe('Volcengine image generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalArkApiKey = process.env.ARK_API_KEY;
  const originalVolcengineApiKey = process.env.OD_VOLCENGINE_API_KEY;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-volcengine-image-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_VOLCENGINE_API_KEY;
    process.env.ARK_API_KEY = 'ark-test-key';
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
    if (originalArkApiKey == null) {
      delete process.env.ARK_API_KEY;
    } else {
      process.env.ARK_API_KEY = originalArkApiKey;
    }
    if (originalVolcengineApiKey == null) {
      delete process.env.OD_VOLCENGINE_API_KEY;
    } else {
      process.env.OD_VOLCENGINE_API_KEY = originalVolcengineApiKey;
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
    await rm(root, { recursive: true, force: true });
  });

  it('routes Seedream 5.0 Pro through Volcengine and marks the output as layer-capable', async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://ark.cn-beijing.volces.com/api/v3/images/generations') {
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer ark-test-key',
          'content-type': 'application/json',
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          model: SEEDREAM_5_PRO_MODEL_ID,
          prompt: 'Separate a product poster into editable design layers\nAspect ratio: 1:1.',
          response_format: 'url',
          size: '2K',
          stream: false,
          output_format: 'png',
          watermark: false,
        });
        return new Response(JSON.stringify({
          model: 'doubao-seedream-5-0-pro',
          created: 1783526400,
          data: [{
            url: 'https://ark-content.example.com/result.png',
            output_format: 'png',
            size: '2048x2048',
          }],
          usage: {
            generated_images: 1,
            input_images: 0,
            output_tokens: 16384,
            total_tokens: 16384,
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      expect(url).toBe('https://ark-content.example.com/result.png');
      expect(init?.redirect).toBe('error');
      return new Response(Buffer.from(PNG_BASE64, 'base64'), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: SEEDREAM_5_PRO_MODEL_ID,
      prompt: 'Separate a product poster into editable design layers',
      aspect: '1:1',
      output: 'seedream-pro.png',
    });

    expect(result.name).toBe('seedream-pro.png');
    expect(result.providerId).toBe('volcengine');
    expect(result.providerNote).toContain(`volcengine/${SEEDREAM_5_PRO_MODEL_ID}`);
    expect(result.providerNote).toContain('layer-capable');
    expect(result.metadata).toEqual({
      capabilities: { layeredOutput: true },
      modelFamily: 'seedream',
      output: {
        format: 'png',
        size: '2048x2048',
      },
      response: {
        created: 1783526400,
        model: 'doubao-seedream-5-0-pro',
      },
      request: {
        outputFormat: 'png',
        responseFormat: 'url',
        size: '2K',
        stream: false,
        watermark: false,
      },
      usage: {
        generated_images: 1,
        input_images: 0,
        output_tokens: 16384,
        total_tokens: 16384,
      },
    });

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'seedream-pro.png'));
    expect(bytes.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('passes reference images to Seedream 5.0 Pro as data URLs', async () => {
    const projectDir = path.join(projectsRoot, 'project-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'reference.png'), Buffer.from(PNG_BASE64, 'base64'));

    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.image).toMatch(/^data:image\/png;base64,/);
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_BASE64, output_format: 'png', size: '2048x2048' }],
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
      model: SEEDREAM_5_PRO_MODEL_ID,
      prompt: 'Turn the reference into separated packaging design layers',
      aspect: '1:1',
      image: 'reference.png',
      output: 'seedream-pro-reference.png',
    });

    expect(result.metadata).toMatchObject({
      request: {
        referenceImages: 1,
      },
    });
  });

  it('passes multiple remote reference URLs to Seedream 5.0 Pro', async () => {
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.image).toEqual([
        'https://ark-project.tos-cn-beijing.volces.com/doc_image/seedream4_imagesToimage_1.png',
        'https://ark-project.tos-cn-beijing.volces.com/doc_image/seedream4_imagesToimage_2.png',
      ]);
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_BASE64, output_format: 'png', size: '2048x2048' }],
        usage: { generated_images: 1, input_images: 2 },
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
      model: SEEDREAM_5_PRO_MODEL_ID,
      prompt: '将图1的服装换为图2的服装',
      aspect: '1:1',
      image: 'https://ark-project.tos-cn-beijing.volces.com/doc_image/seedream4_imagesToimage_1.png',
      images: ['https://ark-project.tos-cn-beijing.volces.com/doc_image/seedream4_imagesToimage_2.png'],
      output: 'seedream-pro-remote-reference.png',
    });

    expect(result.metadata).toMatchObject({
      request: {
        referenceImages: 2,
      },
      usage: {
        generated_images: 1,
        input_images: 2,
      },
    });
  });
});
