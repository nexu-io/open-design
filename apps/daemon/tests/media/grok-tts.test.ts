import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../../src/media/index.js';

const TEST_XAI_BASE_URL = 'https://xai-tts-gateway.example.test';
const WIRE_MODEL = 'grok-tts';

function audioResponse(bytes: Buffer) {
  return new Response(bytes, {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });
}

describe('xAI Grok TTS media generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;
  const originalGrokKey = process.env.OD_GROK_API_KEY;
  const originalXaiKey = process.env.XAI_API_KEY;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-xai-tts-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_GROK_API_KEY;
    delete process.env.XAI_API_KEY;
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    if (originalMediaConfigDir == null) delete process.env.OD_MEDIA_CONFIG_DIR;
    else process.env.OD_MEDIA_CONFIG_DIR = originalMediaConfigDir;
    if (originalDataDir == null) delete process.env.OD_DATA_DIR;
    else process.env.OD_DATA_DIR = originalDataDir;
    if (originalGrokKey == null) delete process.env.OD_GROK_API_KEY;
    else process.env.OD_GROK_API_KEY = originalGrokKey;
    if (originalXaiKey == null) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = originalXaiKey;
    vi.unstubAllGlobals();
    await rm(root, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  it('POSTs the documented minimal /v1/tts shape and saves audio bytes', async () => {
    await writeConfig({
      providers: {
        grok: { apiKey: 'xai-test-key', baseUrl: TEST_XAI_BASE_URL },
      },
    });

    const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x67, 0x72, 0x6f, 0x6b]);
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(`${TEST_XAI_BASE_URL}/tts`);
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer xai-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        text: 'Hello from Grok TTS.',
        voice_id: 'eve',
        language: 'en',
      });
      return audioResponse(mp3);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: WIRE_MODEL,
      audioKind: 'speech',
      prompt: 'Hello from Grok TTS.',
      output: 'grok-speech.mp3',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.providerId).toBe('grok');
    expect(result.providerNote).toContain(`xai/${WIRE_MODEL}`);
    expect(result.providerNote).toContain('voice=eve');

    const onDisk = await readFile(
      path.join(projectsRoot, 'project-1', 'grok-speech.mp3'),
    );
    expect(onDisk.equals(mp3)).toBe(true);
  });

  it('passes a user-provided voice id and language through', async () => {
    await writeConfig({
      providers: {
        grok: { apiKey: 'xai-test-key', baseUrl: TEST_XAI_BASE_URL },
      },
    });

    const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.voice_id).toBe('coral');
      expect(body.language).toBe('zh');
      return audioResponse(mp3);
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: WIRE_MODEL,
      audioKind: 'speech',
      voice: 'coral',
      language: 'zh',
      prompt: '你好。',
      output: 'grok-zh.mp3',
    });
  });

  it('uses XAI_API_KEY env when no Settings key is stored', async () => {
    process.env.XAI_API_KEY = 'env-xai-key';
    const mp3 = Buffer.from([0xff, 0xfb]);
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer env-xai-key',
      });
      return audioResponse(mp3);
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: WIRE_MODEL,
      audioKind: 'speech',
      prompt: 'env path',
      output: 'grok-env.mp3',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the response body when xAI returns an error status', async () => {
    await writeConfig({
      providers: {
        grok: { apiKey: 'xai-test-key', baseUrl: TEST_XAI_BASE_URL },
      },
    });
    const fetchMock = vi.fn(
      async () =>
        new Response('{"error":{"message":"voice not found"}}', {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'audio',
        model: WIRE_MODEL,
        audioKind: 'speech',
        voice: 'unknown-voice',
        prompt: 'test',
        output: 'grok-fail.mp3',
      }),
    ).rejects.toThrow(/xai tts 400/);
  });

  it('rejects when no credentials are available anywhere', async () => {
    // No env, no stored, no xai-tokens.json, no Hermes auth.
    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'audio',
        model: WIRE_MODEL,
        audioKind: 'speech',
        prompt: 'test',
        output: 'grok-no-creds.mp3',
      }),
    ).rejects.toThrow(/no xAI credentials/i);
  });
});
