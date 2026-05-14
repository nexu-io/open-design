import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';

const TEST_SENSEAUDIO_BASE_URL = 'https://senseaudio-gateway.example.test';
const WIRE_MODEL = 'senseaudio-tts-1.5-260319';

function buildOkResponse(audioBytes: Buffer, opts?: { audioLength?: number }) {
  return new Response(
    JSON.stringify({
      data: { audio: audioBytes.toString('hex'), status: 2 },
      extra_info: {
        audio_length: opts?.audioLength ?? 12340,
        audio_sample_rate: 32000,
        audio_size: audioBytes.length,
        bitrate: 128000,
        audio_format: 'mp3',
        audio_channel: 2,
        word_count: 8,
        usage_characters: 8,
      },
      trace_id: 'trace-test',
      base_resp: { status_code: 0, status_msg: 'success' },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('senseaudio media generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-senseaudio-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
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

  it('renders SenseAudio speech with the documented defaults', async () => {
    await writeConfig({
      providers: {
        senseaudio: {
          apiKey: 'sense-test-key',
          baseUrl: TEST_SENSEAUDIO_BASE_URL,
        },
      },
    });

    const mp3Bytes = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x73, 0x65, 0x6e]);
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(`${TEST_SENSEAUDIO_BASE_URL}/v1/t2a_v2`);
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer sense-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        model: WIRE_MODEL,
        text: '你好，欢迎使用 SenseAudio 语音合成服务。',
        stream: false,
        voice_setting: {
          voice_id: 'female_0033_b',
          speed: 1,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          format: 'mp3',
          sample_rate: 32000,
          bitrate: 128000,
          channel: 2,
        },
      });
      return buildOkResponse(mp3Bytes);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: 'senseaudio-tts',
      audioKind: 'speech',
      prompt: '你好，欢迎使用 SenseAudio 语音合成服务。',
      output: 'senseaudio-speech.mp3',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.providerId).toBe('senseaudio');
    expect(result.providerNote).toContain(`senseaudio/${WIRE_MODEL}`);
    expect(result.providerNote).toContain('female_0033_b');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'senseaudio-speech.mp3'));
    expect(bytes.equals(mp3Bytes)).toBe(true);
  });

  it('passes custom voice id through to the request body', async () => {
    await writeConfig({
      providers: {
        senseaudio: {
          apiKey: 'sense-test-key',
          baseUrl: TEST_SENSEAUDIO_BASE_URL,
        },
      },
    });

    const mp3Bytes = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.voice_setting.voice_id).toBe('male_0001_a');
      return buildOkResponse(mp3Bytes);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: 'senseaudio-tts',
      audioKind: 'speech',
      voice: 'male_0001_a',
      prompt: 'Custom voice line.',
      output: 'senseaudio-custom.mp3',
    });

    expect(result.providerNote).toContain('male_0001_a');
  });

  it('falls back to the canonical base URL when none is configured', async () => {
    await writeConfig({
      providers: {
        senseaudio: { apiKey: 'sense-test-key' },
      },
    });

    const fetchMock = vi.fn(async (input: unknown) => {
      expect(String(input)).toBe('https://api.senseaudio.cn/v1/t2a_v2');
      return buildOkResponse(Buffer.from([0x01, 0x02, 0x03]));
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: 'senseaudio-tts',
      audioKind: 'speech',
      prompt: 'Default base url.',
      output: 'senseaudio-default-base.mp3',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads the API key from OD_SENSEAUDIO_API_KEY when storage is empty', async () => {
    process.env.OD_SENSEAUDIO_API_KEY = 'env-sense-key';
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer env-sense-key',
      });
      return buildOkResponse(Buffer.from([0x10, 0x20]));
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: 'senseaudio-tts',
      audioKind: 'speech',
      prompt: 'Env-only key.',
      output: 'senseaudio-env.mp3',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('errors when no API key is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'audio',
        model: 'senseaudio-tts',
        audioKind: 'speech',
        prompt: 'Should fail.',
        output: 'senseaudio-no-key.mp3',
      }),
    ).rejects.toThrow(/no SenseAudio API key/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces upstream base_resp failures verbatim', async () => {
    await writeConfig({
      providers: {
        senseaudio: { apiKey: 'sense-test-key', baseUrl: TEST_SENSEAUDIO_BASE_URL },
      },
    });

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: null,
          base_resp: { status_code: 1004, status_msg: 'voice_id not found' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'audio',
        model: 'senseaudio-tts',
        audioKind: 'speech',
        voice: 'does-not-exist',
        prompt: 'Bad voice.',
        output: 'senseaudio-bad-voice.mp3',
      }),
    ).rejects.toThrow('senseaudio tts api error 1004: voice_id not found');
  });

  it('errors when the audio payload is missing', async () => {
    await writeConfig({
      providers: {
        senseaudio: { apiKey: 'sense-test-key', baseUrl: TEST_SENSEAUDIO_BASE_URL },
      },
    });

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {},
          base_resp: { status_code: 0, status_msg: 'success' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'audio',
        model: 'senseaudio-tts',
        audioKind: 'speech',
        prompt: 'Missing audio.',
        output: 'senseaudio-missing-audio.mp3',
      }),
    ).rejects.toThrow('senseaudio tts response missing data.audio');
  });

  it('surfaces HTTP-level failures with the status code and truncated body', async () => {
    await writeConfig({
      providers: {
        senseaudio: { apiKey: 'sense-test-key', baseUrl: TEST_SENSEAUDIO_BASE_URL },
      },
    });

    const fetchMock = vi.fn(async () =>
      new Response('unauthorized', {
        status: 401,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'audio',
        model: 'senseaudio-tts',
        audioKind: 'speech',
        prompt: 'Bad auth.',
        output: 'senseaudio-401.mp3',
      }),
    ).rejects.toThrow('senseaudio tts 401: unauthorized');
  });
});
