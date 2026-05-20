import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listSenseAudioCatalogue } from '../src/senseaudio-voices.js';

const TEST_BASE_URL = 'https://senseaudio-gateway.example.test';
type FetchInput = Parameters<typeof fetch>[0];

describe('SenseAudio catalogue', () => {
  let root: string;
  let projectRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-senseaudio-voices-'));
    projectRoot = path.join(root, 'project-root');
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_SENSEAUDIO_API_KEY;
    delete process.env.SENSEAUDIO_API_KEY;
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
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
    delete process.env.OD_SENSEAUDIO_API_KEY;
    delete process.env.SENSEAUDIO_API_KEY;
    await rm(root, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  function senseAudioResponse(voices: Array<{ voice_id: string; voice_name: string; description?: string[] }>) {
    return Response.json({
      system_voice: voices,
      voice_cloning: [],
      voice_generation: [],
      base_resp: { status_code: 0, status_msg: 'success' },
    });
  }

  it('does not block the catalogue on a stalled docs label lookup', async () => {
    await writeConfig({
      providers: { senseaudio: { apiKey: 'sa-test-key', baseUrl: TEST_BASE_URL } },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: FetchInput) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL ? input.toString() : input.url;
      if (url.includes('docs.senseaudio.cn')) {
        return new Promise<Response>((resolve) => {
          setTimeout(() => resolve(new Response('eventually', { status: 404 })), 2_000);
        });
      }
      return senseAudioResponse([
        { voice_id: 'male_0027_a', voice_name: '亢奋主播', description: ['多状态高能男声。'] },
      ]);
    }));

    await expect(Promise.race([
      listSenseAudioCatalogue(projectRoot),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 1_000)),
    ])).resolves.toMatchObject({
      male_0027: {
        variants: {
          male_0027_a: '热情介绍',
        },
      },
    });
  });

  it('shapes API voices into a prefix-keyed catalogue with hardcoded variant labels', async () => {
    await writeConfig({
      providers: { senseaudio: { apiKey: 'sa-test-key', baseUrl: TEST_BASE_URL } },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(`${TEST_BASE_URL}/v1/get_voice`);
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ voice_type: 'all' });
      return senseAudioResponse([
        // Multi-variant persona: prefix becomes the key.
        ...['a', 'b', 'c', 'd', 'e', 'f'].map((s) => ({
          voice_id: `male_0028_${s}`,
          voice_name: '可靠青叔',
          description: ['多状态青叔，时而严肃认真、时而阳光可亲。'],
        })),
        // Marketing persona, also multi-variant.
        ...['a', 'b', 'c'].map((s) => ({
          voice_id: `male_0027_${s}`,
          voice_name: '亢奋主播',
          description: ['多状态高能男声。'],
        })),
      ]);
    }));

    const catalogue = await listSenseAudioCatalogue(projectRoot);
    expect(catalogue['male_0028']).toEqual({
      name: '可靠青叔',
      description: '多状态青叔，时而严肃认真、时而阳光可亲。',
      variants: {
        male_0028_a: '内容剖析',
        male_0028_b: '开场介绍',
        male_0028_c: '广告中插',
        male_0028_d: '轻松铺陈',
        male_0028_e: '细心提问',
        male_0028_f: '主题升华',
      },
    });
    expect(catalogue['male_0027']).toEqual({
      name: '亢奋主播',
      description: '多状态高能男声。',
      variants: {
        male_0027_a: '热情介绍',
        male_0027_b: '卖点解读',
        male_0027_c: '促销逼单',
      },
    });
  });

  it('keys colliding prefixes (e.g. female_0030_*) by full voice_id', async () => {
    await writeConfig({
      providers: { senseaudio: { apiKey: 'sa-test-key', baseUrl: TEST_BASE_URL } },
    });
    vi.stubGlobal('fetch', vi.fn(async () => senseAudioResponse([
      { voice_id: 'female_0030_a', voice_name: '凌厉御姐', description: ['凌厉果决。'] },
      { voice_id: 'female_0030_b', voice_name: '沉稳帅姐', description: ['沉稳大气。'] },
      { voice_id: 'female_0030_c', voice_name: '高能姐姐', description: ['开朗成熟。'] },
    ])));

    const catalogue = await listSenseAudioCatalogue(projectRoot);
    expect(Object.keys(catalogue).sort()).toEqual([
      'female_0030_a',
      'female_0030_b',
      'female_0030_c',
    ]);
    expect(catalogue['female_0030_a']!.name).toBe('凌厉御姐');
    expect(catalogue['female_0030_b']!.name).toBe('沉稳帅姐');
    expect(catalogue['female_0030_c']!.name).toBe('高能姐姐');
  });

  it('falls back to voice_name (not "通用") for voice_ids missing from every label source', async () => {
    await writeConfig({
      providers: { senseaudio: { apiKey: 'sa-test-key', baseUrl: TEST_BASE_URL } },
    });
    // Single fetch mock that handles both the docs-catalog scrape AND
    // the /v1/get_voice call. The docs URL is forced to 404 so the
    // daemon falls through to BACKUP_VARIANT_LABELS, which also lacks
    // `cloned_user_0001` (it is a runtime-cloned voice, not a system
    // persona) — exercising the final per-voice fallback path.
    vi.stubGlobal('fetch', vi.fn(async (input: FetchInput) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL ? input.toString() : input.url;
      if (url.includes('docs.senseaudio.cn')) {
        return new Response('not found', { status: 404 });
      }
      return Response.json({
        system_voice: [],
        voice_cloning: [
          { voice_id: 'cloned_user_0001', voice_name: '我的克隆音', description: ['用户克隆音色。'] },
        ],
        voice_generation: [],
        base_resp: { status_code: 0, status_msg: 'success' },
      });
    }));

    const catalogue = await listSenseAudioCatalogue(projectRoot);
    // No trailing `_[a-z]` suffix, so stripSuffix leaves the voice_id
    // intact — the catalogue keys by the full id. The variant label
    // falls back to the persona's voice_name (not the static "通用"
    // placeholder used by the original implementation) so the agent
    // still has a meaningful anchor when neither label source covers
    // this voice.
    expect(catalogue['cloned_user_0001']).toEqual({
      name: '我的克隆音',
      description: '用户克隆音色。',
      variants: { cloned_user_0001: '我的克隆音' },
    });
  });

  it('treats base_resp.status_code != 0 as an error even when HTTP is 200', async () => {
    await writeConfig({
      providers: { senseaudio: { apiKey: 'sa-test-key', baseUrl: TEST_BASE_URL } },
    });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      system_voice: [],
      voice_cloning: [],
      voice_generation: [],
      base_resp: { status_code: 1004, status_msg: 'invalid api key' },
    })));

    await expect(listSenseAudioCatalogue(projectRoot)).rejects.toThrow(
      'senseaudio voices api error 1004: invalid api key',
    );
  });

  it('caches successful lookups for the same provider config', async () => {
    await writeConfig({
      providers: { senseaudio: { apiKey: 'sa-test-key', baseUrl: TEST_BASE_URL } },
    });
    const fetchMock = vi.fn(async () => senseAudioResponse([
      { voice_id: 'male_0027_a', voice_name: '亢奋主播', description: ['多状态高能男声。'] },
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const first = await listSenseAudioCatalogue(projectRoot);
    const second = await listSenseAudioCatalogue(projectRoot);
    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces missing credentials before calling upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(listSenseAudioCatalogue(projectRoot)).rejects.toThrow(
      'no SenseAudio API key',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('survives an API payload that drops the expected voice arrays', async () => {
    // Defensive: if the API ever renames `system_voice`/`voice_cloning`/
    // `voice_generation` we should return an empty catalogue, not crash.
    await writeConfig({
      providers: { senseaudio: { apiKey: 'sa-test-key', baseUrl: TEST_BASE_URL } },
    });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      // Completely different shape than our parser expects.
      data: [{ id: 'male_0028_a', label: '可靠青叔' }],
      base_resp: { status_code: 0, status_msg: 'success' },
    })));

    const catalogue = await listSenseAudioCatalogue(projectRoot);
    expect(catalogue).toEqual({});
  });
});
