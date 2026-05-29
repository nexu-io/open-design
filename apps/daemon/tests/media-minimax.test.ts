import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';
const MP3_BYTES = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]);
const TEST_MINIMAX_BASE_URL = 'https://minimax-proxy.example.test/v1';

describe('MiniMax media generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;
  const originalOdMinimaxKey = process.env.OD_MINIMAX_API_KEY;
  const originalTokenPlanKey = process.env.MINIMAX_TOKENPLAN_KEY;
  const originalTokenPlanKeyAlt = process.env.MINIMAX_TOKEN_PLAN_KEY;
  const originalMinimaxKey = process.env.MINIMAX_API_KEY;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-minimax-media-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_MINIMAX_API_KEY;
    delete process.env.MINIMAX_TOKENPLAN_KEY;
    delete process.env.MINIMAX_TOKEN_PLAN_KEY;
    delete process.env.MINIMAX_API_KEY;
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    restoreEnv('OD_MEDIA_CONFIG_DIR', originalMediaConfigDir);
    restoreEnv('OD_DATA_DIR', originalDataDir);
    restoreEnv('OD_MINIMAX_API_KEY', originalOdMinimaxKey);
    restoreEnv('MINIMAX_TOKENPLAN_KEY', originalTokenPlanKey);
    restoreEnv('MINIMAX_TOKEN_PLAN_KEY', originalTokenPlanKeyAlt);
    restoreEnv('MINIMAX_API_KEY', originalMinimaxKey);
    await rm(root, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  it('renders image-01 through the MiniMax Token Plan image endpoint', async () => {
    process.env.MINIMAX_TOKENPLAN_KEY = 'token-plan-key';

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.minimaxi.com/v1/image_generation');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer token-plan-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'image-01',
        prompt: 'A clean product hero render',
        response_format: 'base64',
        n: 1,
        aspect_ratio: '16:9',
      });
      return jsonResponse({
        data: { image_base64: [PNG_BASE64] },
        base_resp: { status_code: 0, status_msg: 'success' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'image-01',
      prompt: 'A clean product hero render',
      aspect: '16:9',
      output: 'minimax.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.providerId).toBe('minimax');
    expect(result.providerNote).toContain('minimax/image-01');
    expect(result.providerNote).toContain('16:9');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'minimax.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('honors configured MiniMax base URLs that already include /v1', async () => {
    await writeConfig({
      providers: {
        minimax: {
          apiKey: 'stored-minimax-key',
          baseUrl: TEST_MINIMAX_BASE_URL,
        },
      },
    });

    const fetchMock = vi.fn(async (input: unknown) => {
      expect(String(input)).toBe(`${TEST_MINIMAX_BASE_URL}/image_generation`);
      return jsonResponse({
        data: { image_base64: [PNG_BASE64] },
        base_resp: { status_code: 0, status_msg: 'success' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'image-01',
      prompt: 'Configured base URL.',
      output: 'minimax-base.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders music-2.6 instrumental audio through MiniMax music_generation', async () => {
    process.env.OD_MINIMAX_API_KEY = 'od-minimax-key';

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.minimaxi.com/v1/music_generation');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer od-minimax-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'music-2.6',
        prompt: 'Warm analog synth loop',
        lyrics: '',
        lyrics_optimizer: false,
        is_instrumental: true,
        output_format: 'hex',
        audio_setting: {
          sample_rate: 44100,
          bitrate: 256000,
          format: 'mp3',
        },
      });
      return jsonResponse({
        data: { audio: MP3_BYTES.toString('hex') },
        extra_info: { music_duration: 18000 },
        base_resp: { status_code: 0, status_msg: 'success' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      audioKind: 'music',
      model: 'music-2.6',
      prompt: 'Warm analog synth loop',
      output: 'minimax-music.mp3',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.providerId).toBe('minimax');
    expect(result.providerNote).toContain('minimax/music-2.6');
    expect(result.providerNote).toContain('18s');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'minimax-music.mp3'));
    expect(bytes.equals(MP3_BYTES)).toBe(true);
  });

  it('surfaces MiniMax base_resp failures', async () => {
    process.env.MINIMAX_TOKENPLAN_KEY = 'token-plan-key';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: {},
      base_resp: { status_code: 2049, status_msg: 'invalid api key' },
    })));

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'image-01',
      prompt: 'Should fail.',
      output: 'minimax-fail.png',
    })).rejects.toThrow('minimax image api error 2049: invalid api key');
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function restoreEnv(name: string, value: string | undefined) {
  if (value == null) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
