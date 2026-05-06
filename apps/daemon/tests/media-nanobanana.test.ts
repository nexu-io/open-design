import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';
const TEST_NANOBANANA_BASE_URL = 'https://nano-banana-gateway.example.test';

describe('nano-banana media generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-nanobanana-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    process.env.OD_NANOBANANA_API_KEY = 'nano-test-key';
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    delete process.env.OD_NANOBANANA_API_KEY;
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

  it('renders Nano Banana images through generateContent', async () => {
    await writeConfig({
      providers: {
        nanobanana: {
          baseUrl: TEST_NANOBANANA_BASE_URL,
          model: 'custom-nano-model',
        },
      },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(`${TEST_NANOBANANA_BASE_URL}/v1beta/models/custom-nano-model:generateContent`);
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer nano-test-key',
        'content-type': 'application/json',
      });
      expect(init?.headers).not.toHaveProperty('x-goog-api-key');
      expect(JSON.parse(String(init?.body))).toEqual({
        contents: [{ parts: [{ text: 'A watercolor shiba inu under cherry blossoms' }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            aspectRatio: '16:9',
            imageSize: '1K',
          },
        },
      });
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                mimeType: 'image/png',
                data: PNG_BASE64,
              },
            }],
          },
        }],
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
      model: 'gemini-3.1-flash-image-preview',
      prompt: 'A watercolor shiba inu under cherry blossoms',
      aspect: '16:9',
      output: 'nano.png',
    });

    expect(result.name).toBe('nano.png');
    expect(result.providerId).toBe('nanobanana');
    expect(result.providerNote).toContain('nano-banana/custom-nano-model');
    expect(result.providerNote).toContain('16:9');
    expect(result.providerNote).toContain('1K');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'nano.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('uses x-goog-api-key for the official Gemini endpoint', async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent');
      expect(init?.headers).toMatchObject({
        'content-type': 'application/json',
        'x-goog-api-key': 'nano-test-key',
      });
      expect(init?.headers).not.toHaveProperty('authorization');
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                mimeType: 'image/png',
                data: PNG_BASE64,
              },
            }],
          },
        }],
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
      model: 'gemini-3.1-flash-image-preview',
      prompt: 'A studio photo of a yellow banana on white seamless paper',
      aspect: '1:1',
      output: 'official.png',
    });

    expect(result.providerId).toBe('nanobanana');
    expect(result.name).toBe('official.png');
  });

  it('surfaces upstream Nano Banana errors', async () => {
    await writeConfig({
      providers: {
        nanobanana: {
          baseUrl: TEST_NANOBANANA_BASE_URL,
        },
      },
    });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'quota exceeded' },
    }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    })));

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'gemini-3.1-flash-image-preview',
      prompt: 'A neon city skyline',
      aspect: '1:1',
    })).rejects.toThrow(/nano-banana image 429/);
  });
});
