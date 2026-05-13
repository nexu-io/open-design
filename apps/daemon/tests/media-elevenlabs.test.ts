import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';

const TEST_ELEVENLABS_BASE_URL = 'https://elevenlabs-gateway.example.test';

describe('elevenlabs media generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-elevenlabs-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
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

  it('renders ElevenLabs speech', async () => {
    await writeConfig({
      providers: {
        elevenlabs: {
          apiKey: 'eleven-test-key',
          baseUrl: TEST_ELEVENLABS_BASE_URL,
        },
      },
    });

    const mp3Bytes = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0f]);
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(
        `${TEST_ELEVENLABS_BASE_URL}/v1/text-to-speech/voice-123?output_format=mp3_44100_128`,
      );
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'xi-api-key': 'eleven-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        text: 'A warm product narrator.',
        model_id: 'eleven_v3',
        voice_settings: {
          stability: 1,
          similarity_boost: 1,
          style: 0,
          speed: 1,
          use_speaker_boost: true,
        },
      });

      return new Response(mp3Bytes, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: 'elevenlabs-v3',
      audioKind: 'speech',
      voice: 'voice-123',
      prompt: 'A warm product narrator.',
      output: 'elevenlabs-speech.mp3',
    });

    expect(result.providerId).toBe('elevenlabs');
    expect(result.providerNote).toContain('elevenlabs/eleven_v3');
    expect(result.providerNote).toContain('voice-123');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'elevenlabs-speech.mp3'));
    expect(bytes.equals(mp3Bytes)).toBe(true);
  });

  it('rejects blank ElevenLabs speech prompts before provider calls', async () => {
    await writeConfig({
      providers: {
        elevenlabs: {
          apiKey: 'eleven-test-key',
          baseUrl: TEST_ELEVENLABS_BASE_URL,
        },
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: 'elevenlabs-v3',
      audioKind: 'speech',
      voice: 'voice-123',
      prompt: '   ',
      output: 'elevenlabs-speech-empty.mp3',
    })).rejects.toThrow('ElevenLabs TTS prompt must not be empty');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders ElevenLabs sound effects', async () => {
    await writeConfig({
      providers: {
        elevenlabs: {
          apiKey: 'eleven-test-key',
          baseUrl: TEST_ELEVENLABS_BASE_URL,
        },
      },
    });

    const mp3Bytes = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x73, 0x66, 0x78]);
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(
        `${TEST_ELEVENLABS_BASE_URL}/v1/sound-generation?output_format=mp3_44100_128`,
      );
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'xi-api-key': 'eleven-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        text: 'A cinematic whoosh between sections.',
        duration_seconds: 30,
        prompt_influence: 0.3,
        model_id: 'eleven_text_to_sound_v2',
      });

      return new Response(mp3Bytes, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: 'elevenlabs-sfx',
      audioKind: 'sfx',
      duration: 120,
      prompt: 'A cinematic whoosh between sections.',
      output: 'elevenlabs-sfx.mp3',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.providerId).toBe('elevenlabs');
    expect(result.providerNote).toContain('elevenlabs/eleven_text_to_sound_v2');
    expect(result.providerNote).toContain('30s');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'elevenlabs-sfx.mp3'));
    expect(bytes.equals(mp3Bytes)).toBe(true);
  });

  it('preserves in-range ElevenLabs sound effects durations', async () => {
    await writeConfig({
      providers: {
        elevenlabs: {
          apiKey: 'eleven-test-key',
          baseUrl: TEST_ELEVENLABS_BASE_URL,
        },
      },
    });

    const mp3Bytes = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x31, 0x36]);
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(
        `${TEST_ELEVENLABS_BASE_URL}/v1/sound-generation?output_format=mp3_44100_128`,
      );
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'xi-api-key': 'eleven-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        text: 'A cinematic whoosh between sections.',
        duration_seconds: 16,
        prompt_influence: 0.3,
        model_id: 'eleven_text_to_sound_v2',
      });

      return new Response(mp3Bytes, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: 'elevenlabs-sfx',
      audioKind: 'sfx',
      duration: 16,
      prompt: 'A cinematic whoosh between sections.',
      output: 'elevenlabs-sfx-16.mp3',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.providerId).toBe('elevenlabs');
    expect(result.providerNote).toContain('elevenlabs/eleven_text_to_sound_v2');
    expect(result.providerNote).toContain('16s');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'elevenlabs-sfx-16.mp3'));
    expect(bytes.equals(mp3Bytes)).toBe(true);
  });

  it('passes ElevenLabs sound effects loop and prompt influence controls', async () => {
    await writeConfig({
      providers: {
        elevenlabs: {
          apiKey: 'eleven-test-key',
          baseUrl: TEST_ELEVENLABS_BASE_URL,
        },
      },
    });

    const mp3Bytes = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x6c, 0x6f, 0x6f, 0x70]);
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(
        `${TEST_ELEVENLABS_BASE_URL}/v1/sound-generation?output_format=mp3_44100_128`,
      );
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'xi-api-key': 'eleven-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        text: 'Seamless rainy alley ambience loop, wet pavement drips, distant traffic, no voices.',
        duration_seconds: 20,
        prompt_influence: 0.72,
        loop: true,
        model_id: 'eleven_text_to_sound_v2',
      });

      return new Response(mp3Bytes, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: 'elevenlabs-sfx',
      audioKind: 'sfx',
      duration: 20,
      prompt: 'Seamless rainy alley ambience loop, wet pavement drips, distant traffic, no voices.',
      output: 'elevenlabs-sfx-loop.mp3',
      loop: true,
      promptInfluence: 0.72,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.providerId).toBe('elevenlabs');
    expect(result.providerNote).toContain('loop');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'elevenlabs-sfx-loop.mp3'));
    expect(bytes.equals(mp3Bytes)).toBe(true);
  });

  it('rejects blank ElevenLabs sound effect prompts before provider calls', async () => {
    await writeConfig({
      providers: {
        elevenlabs: {
          apiKey: 'eleven-test-key',
          baseUrl: TEST_ELEVENLABS_BASE_URL,
        },
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: 'elevenlabs-sfx',
      audioKind: 'sfx',
      duration: 10,
      prompt: '   ',
      output: 'elevenlabs-sfx-empty.mp3',
    })).rejects.toThrow('ElevenLabs SFX prompt must not be empty');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects overlong ElevenLabs sound effects prompts before provider calls', async () => {
    await writeConfig({
      providers: {
        elevenlabs: {
          apiKey: 'eleven-test-key',
          baseUrl: TEST_ELEVENLABS_BASE_URL,
        },
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: 'elevenlabs-sfx',
      audioKind: 'sfx',
      duration: 10,
      prompt: 'p'.repeat(451),
      output: 'elevenlabs-sfx-too-long.mp3',
    })).rejects.toThrow('ElevenLabs SFX prompt exceeds 450 characters (451)');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clamps below-minimum ElevenLabs sound effects durations', async () => {
    await writeConfig({
      providers: {
        elevenlabs: {
          apiKey: 'eleven-test-key',
          baseUrl: TEST_ELEVENLABS_BASE_URL,
        },
      },
    });

    const mp3Bytes = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x30, 0x35]);
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(
        `${TEST_ELEVENLABS_BASE_URL}/v1/sound-generation?output_format=mp3_44100_128`,
      );
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'xi-api-key': 'eleven-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        text: 'A cinematic whoosh between sections.',
        duration_seconds: 0.5,
        prompt_influence: 0.3,
        model_id: 'eleven_text_to_sound_v2',
      });

      return new Response(mp3Bytes, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: 'elevenlabs-sfx',
      audioKind: 'sfx',
      duration: 0.25,
      prompt: 'A cinematic whoosh between sections.',
      output: 'elevenlabs-sfx-min.mp3',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.providerId).toBe('elevenlabs');
    expect(result.providerNote).toContain('elevenlabs/eleven_text_to_sound_v2');
    expect(result.providerNote).toContain('0.5s');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'elevenlabs-sfx-min.mp3'));
    expect(bytes.equals(mp3Bytes)).toBe(true);
  });
});
