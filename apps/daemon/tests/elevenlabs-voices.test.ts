import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listElevenLabsVoiceOptions } from '../src/elevenlabs-voices.js';

const TEST_BASE_URL = 'https://elevenlabs-gateway.example.test';

describe('ElevenLabs voice options', () => {
  let root: string;
  let projectRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-elevenlabs-voices-'));
    projectRoot = path.join(root, 'project-root');
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
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
    delete process.env.OD_ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    await rm(root, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  it('lists account voices as prompt-ready options', async () => {
    await writeConfig({
      providers: {
        elevenlabs: {
          apiKey: 'eleven-test-key',
          baseUrl: TEST_BASE_URL,
        },
      },
    });
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(`${TEST_BASE_URL}/v2/voices?page_size=100`);
      expect(init?.method).toBe('GET');
      expect(init?.headers).toMatchObject({
        'xi-api-key': 'eleven-test-key',
      });
      return Response.json({
        voices: [
          {
            voice_id: '21m00Tcm4TlvDq8ikWAM',
            name: 'Rachel',
            category: 'premade',
            labels: { accent: 'american', gender: 'female' },
            preview_url: 'https://example.test/rachel.mp3',
          },
          {
            voice_id: 'pNInz6obpgDQGcFmaJgB',
            name: 'Adam',
            category: 'premade',
            labels: { accent: 'american', gender: 'male' },
          },
          {
            voice_id: '',
            name: 'Broken',
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(listElevenLabsVoiceOptions(projectRoot, { limit: 100 })).resolves.toEqual([
      {
        voiceId: '21m00Tcm4TlvDq8ikWAM',
        name: 'Rachel',
        category: 'premade',
        labels: { accent: 'american', gender: 'female' },
        previewUrl: 'https://example.test/rachel.mp3',
      },
      {
        voiceId: 'pNInz6obpgDQGcFmaJgB',
        name: 'Adam',
        category: 'premade',
        labels: { accent: 'american', gender: 'male' },
      },
    ]);
  });

  it('caches successful voice lookups for the same provider config', async () => {
    await writeConfig({
      providers: {
        elevenlabs: {
          apiKey: 'eleven-test-key',
          baseUrl: TEST_BASE_URL,
        },
      },
    });
    const fetchMock = vi.fn(async () => Response.json({
      voices: [
        {
          voice_id: '21m00Tcm4TlvDq8ikWAM',
          name: 'Rachel',
          category: 'premade',
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await listElevenLabsVoiceOptions(projectRoot, { limit: 100 });
    const second = await listElevenLabsVoiceOptions(projectRoot, { limit: 100 });

    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces missing ElevenLabs credentials before calling upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(listElevenLabsVoiceOptions(projectRoot)).rejects.toThrow(
      'no ElevenLabs API key',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
