import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';
const TEST_MINIMAX_BASE_URL = 'https://minimax-gateway.example.test';
const TEST_MINIMAX_DEFAULT_BASE_URL = 'https://api.minimax.io';

describe('minimax image generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;
  const originalMinimaxApiKey = process.env.OD_MINIMAX_API_KEY;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-minimax-image-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    process.env.OD_MINIMAX_API_KEY = 'minimax-test-key';
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    if (originalMinimaxApiKey == null) {
      delete process.env.OD_MINIMAX_API_KEY;
    } else {
      process.env.OD_MINIMAX_API_KEY = originalMinimaxApiKey;
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

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  it('renders MiniMax images through the image_generation endpoint', async () => {
    await writeConfig({
      providers: {
        minimax: {
          baseUrl: TEST_MINIMAX_BASE_URL,
          model: 'image-01-custom',
        },
      },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(`${TEST_MINIMAX_BASE_URL}/v1/image_generation`);
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer minimax-test-key',
        'content-type': 'application/json',
      });
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        model: 'image-01-custom',
        prompt: 'A watercolor shiba inu under cherry blossoms',
        aspect_ratio: '16:9',
        response_format: 'base64',
        n: 1,
      });
      expect(body).not.toHaveProperty('subject_reference');
      return new Response(JSON.stringify({
        base_resp: { status_code: 0, status_msg: 'success' },
        data: { image_base64: [PNG_BASE64] },
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
      model: 'minimax-image-01',
      prompt: 'A watercolor shiba inu under cherry blossoms',
      aspect: '16:9',
      output: 'minimax.png',
    });

    expect(result.name).toBe('minimax.png');
    expect(result.providerId).toBe('minimax');
    expect(result.providerNote).toContain('minimax/image-01-custom');
    expect(result.providerNote).toContain('16:9');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'minimax.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('forwards --image as subject_reference[0].image_file for I2I', async () => {
    await writeConfig({
      providers: {
        minimax: { baseUrl: TEST_MINIMAX_BASE_URL },
      },
    });

    // Write a real reference PNG inside the project so resolveProjectImage
    // can stat it and turn it into a data URL the renderer can splice in.
    const projectDir = path.join(projectsRoot, 'project-1');
    await mkdir(projectDir, { recursive: true });
    const refPath = path.join(projectDir, 'ref.png');
    await writeFile(refPath, Buffer.from(PNG_BASE64, 'base64'));

    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      // Subject reference must be present and carry the data URL of the
      // --image file (we don't assert exact bytes because the data URL is
      // derived from the on-disk PNG; the prefix is the contract).
      expect(body.subject_reference).toEqual([{
        type: 'character',
        image_file: expect.stringMatching(/^data:image\/png;base64,/),
      }]);
      // Wire model falls through to MINIMAX_IMAGE_MODEL_MAP when no override.
      expect(body.model).toBe('image-01');
      // defaultAspectFor('image') returns '1:1', which IS in the MiniMax
      // allowlist, so the renderer forwards it.
      expect(body.aspect_ratio).toBe('1:1');
      return new Response(JSON.stringify({
        base_resp: { status_code: 0, status_msg: 'success' },
        data: { image_base64: [PNG_BASE64] },
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
      model: 'minimax-image-01',
      prompt: 'restyle as ukiyo-e',
      image: './ref.png',
      output: 'minimax-i2i.png',
    });

    expect(result.name).toBe('minimax-i2i.png');
    expect(result.providerId).toBe('minimax');
    // providerNote must NOT echo the data URL — no PII leak in metadata.
    expect(result.providerNote).not.toContain('data:image');
    expect(result.providerNote).toContain('minimax/image-01');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'minimax-i2i.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });
});
