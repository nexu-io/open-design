import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media/index.js';

const TEST_A2E_BASE_URL = 'https://a2e-gateway.example.test';

describe('a2e media generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-a2e-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_A2E_API_KEY;
    delete process.env.A2E_API_KEY;
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
    delete process.env.OD_A2E_API_KEY;
    delete process.env.A2E_API_KEY;
    await rm(root, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  it('renders A2E Text-to-Speech', async () => {
    await writeConfig({
      providers: {
        a2e: {
          apiKey: 'a2e-test-key',
          baseUrl: TEST_A2E_BASE_URL,
        },
      },
    });

    const mockAudioBytes = Buffer.from([0x57, 0x41, 0x56, 0x45, 0x01, 0x02, 0x03]);
    const mockAudioUrl = 'https://cdn.a2e.ai/tts/speech.wav';

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/send_tts`) {
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          'authorization': 'Bearer a2e-test-key',
          'content-type': 'application/json',
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          msg: 'This is an A2E test speech.',
          speechRate: 1.0,
          tts_id: '66dc3c1b7dc1f1c483cc5ab8',
        });

        return new Response(
          JSON.stringify({
            code: 0,
            data: mockAudioUrl,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (urlStr === mockAudioUrl) {
        return new Response(mockAudioBytes, {
          status: 200,
          headers: { 'content-type': 'audio/wav' },
        });
      }

      throw new Error(`Unexpected fetch URL: ${urlStr}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: 'a2e-tts',
      audioKind: 'speech',
      voice: '66dc3c1b7dc1f1c483cc5ab8',
      prompt: 'This is an A2E test speech.',
      output: 'a2e-speech.wav',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.providerId).toBe('a2e');
    expect(result.providerNote).toContain('a2e/a2e-tts');
    expect(result.providerNote).toContain('voice=66dc3c1b7dc1f1c483cc5ab8');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'a2e-speech.wav'));
    expect(bytes.equals(mockAudioBytes)).toBe(true);
  });

  it('renders A2E Avatar Video via multi-stage generate and list polling', async () => {
    await writeConfig({
      providers: {
        a2e: {
          apiKey: 'a2e-test-key',
          baseUrl: TEST_A2E_BASE_URL,
        },
      },
    });

    const mockAudioUrl = 'https://cdn.a2e.ai/tts/video_speech.wav';
    const mockVideoUrl = 'https://cdn.a2e.ai/video/avatar_result.mp4';
    const mockVideoBytes = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
    const mockTaskId = '66f1234567890abcdef12345';

    let pollCount = 0;

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const urlStr = String(input);

      // Stage 1: Send TTS
      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/send_tts`) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          msg: 'Generate an avatar video.',
          speechRate: 1.0,
          tts_id: '66dc3c1b7dc1f1c483cc5ab8',
        });
        return new Response(
          JSON.stringify({
            code: 0,
            data: mockAudioUrl,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      // Stage 2: Generate Video
      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/generate`) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          anchor_id: '507f1f77bcf86cd799439011',
          anchor_type: 0,
          audioSrc: mockAudioUrl,
        });
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              _id: mockTaskId,
              status: 'sent',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      // Stage 3: Polling List
      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/list`) {
        expect(init?.method).toBe('POST');
        pollCount++;

        // First poll returns process, second returns success
        const statusValue = pollCount === 1 ? 'process' : 'success';
        const responseData = {
          code: 0,
          data: {
            list: [
              {
                _id: mockTaskId,
                status: statusValue,
                result: statusValue === 'success' ? mockVideoUrl : null,
              },
            ],
          },
        };

        return new Response(JSON.stringify(responseData), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      // Stage 4: Download completed video file
      if (urlStr === mockVideoUrl) {
        return new Response(mockVideoBytes, {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        });
      }

      throw new Error(`Unexpected fetch URL: ${urlStr}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'a2e-avatar-video',
      voice: '507f1f77bcf86cd799439011',
      prompt: 'Generate an avatar video.',
      output: 'a2e-video.mp4',
    });

    expect(result.providerId).toBe('a2e');
    expect(result.providerNote).toContain('a2e/a2e-avatar-video');
    expect(result.providerNote).toContain('avatar=507f1f77bcf86cd799439011');
    expect(pollCount).toBe(2);

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'a2e-video.mp4'));
    expect(bytes.equals(mockVideoBytes)).toBe(true);
  });

  it('renders A2E Text-to-Speech with a custom/cloned voice', async () => {
    await writeConfig({
      providers: {
        a2e: {
          apiKey: 'a2e-test-key',
          baseUrl: TEST_A2E_BASE_URL,
        },
      },
    });

    const mockAudioBytes = Buffer.from([0x57, 0x41, 0x56, 0x45, 0x01, 0x02, 0x03]);
    const mockAudioUrl = 'https://cdn.a2e.ai/tts/speech.wav';

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/send_tts`) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          msg: 'This is an A2E custom voice test.',
          speechRate: 1.0,
          user_voice_id: '66dc3c1b7dc1f1c483cc5ab8',
          country: 'en',
          region: 'US',
        });

        return new Response(
          JSON.stringify({
            code: 0,
            data: mockAudioUrl,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (urlStr === mockAudioUrl) {
        return new Response(mockAudioBytes, {
          status: 200,
          headers: { 'content-type': 'audio/wav' },
        });
      }

      throw new Error(`Unexpected fetch URL: ${urlStr}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'audio',
      model: 'a2e-tts',
      audioKind: 'speech',
      voice: 'custom:66dc3c1b7dc1f1c483cc5ab8',
      prompt: 'This is an A2E custom voice test.',
      output: 'a2e-speech.wav',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.providerId).toBe('a2e');
    expect(result.providerNote).toContain('a2e/a2e-tts');
    expect(result.providerNote).toContain('voice=66dc3c1b7dc1f1c483cc5ab8');
  });

  it('renders A2E Custom Avatar Video', async () => {
    await writeConfig({
      providers: {
        a2e: {
          apiKey: 'a2e-test-key',
          baseUrl: TEST_A2E_BASE_URL,
        },
      },
    });

    const mockAudioUrl = 'https://cdn.a2e.ai/tts/video_speech.wav';
    const mockVideoUrl = 'https://cdn.a2e.ai/video/avatar_result.mp4';
    const mockVideoBytes = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
    const mockTaskId = '66f1234567890abcdef12345';

    let pollCount = 0;

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const urlStr = String(input);

      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/send_tts`) {
        expect(init?.method).toBe('POST');
        return new Response(
          JSON.stringify({
            code: 0,
            data: mockAudioUrl,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/generate`) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          anchor_id: '507f1f77bcf86cd799439011',
          anchor_type: 1,
          audioSrc: mockAudioUrl,
        });
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              _id: mockTaskId,
              status: 'sent',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/list`) {
        pollCount++;
        return new Response(JSON.stringify({
          code: 0,
          data: {
            list: [
              {
                _id: mockTaskId,
                status: 'success',
                result: mockVideoUrl,
              },
            ],
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (urlStr === mockVideoUrl) {
        return new Response(mockVideoBytes, {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        });
      }

      throw new Error(`Unexpected fetch URL: ${urlStr}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'a2e-avatar-video',
      voice: 'custom:507f1f77bcf86cd799439011',
      prompt: 'Generate an avatar video.',
      output: 'a2e-video.mp4',
    });

    expect(result.providerId).toBe('a2e');
    expect(result.providerNote).toContain('avatar=507f1f77bcf86cd799439011');
    expect(pollCount).toBe(1);
  });

  it('rejects media generation when API key is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-1',
        surface: 'audio',
        model: 'a2e-tts',
        audioKind: 'speech',
        prompt: 'Should fail.',
        output: 'fail.wav',
      })
    ).rejects.toThrow('no A2E API key');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails fast when the A2E list poll returns a non-200 HTTP status (e.g. 401)', async () => {
    // Regression test: the old loop treated !listResp.ok as a silent retry,
    // so a persistent 401 would only surface as a generic timeout after 10 min.
    // After the fix, the first non-2xx poll response throws immediately.
    await writeConfig({
      providers: {
        a2e: {
          apiKey: 'bad-key',
          baseUrl: TEST_A2E_BASE_URL,
        },
      },
    });

    const mockAudioUrl = 'https://cdn.a2e.ai/tts/video_speech.wav';
    const mockTaskId = '66f1234567890abcdef99999';

    const fetchMock = vi.fn(async (input: unknown, _init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/send_tts`) {
        return new Response(JSON.stringify({ code: 0, data: mockAudioUrl }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/generate`) {
        return new Response(
          JSON.stringify({ code: 0, data: { _id: mockTaskId } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/list`) {
        // Simulate a persistent 401 on the poll endpoint (e.g. rotated key).
        return new Response('Unauthorized', {
          status: 401,
          headers: { 'content-type': 'text/plain' },
        });
      }
      throw new Error(`Unexpected fetch URL: ${urlStr}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-fail-fast-401',
        surface: 'video',
        model: 'a2e-avatar-video',
        voice: '507f1f77bcf86cd799439011',
        prompt: 'Fail fast on 401.',
        output: 'fail-fast.mp4',
      }),
    ).rejects.toThrow('A2E video poll error 401');
  });

  it('fails fast when the A2E list poll returns code !== 0 (e.g. auth error)', async () => {
    // Regression test: the old loop treated code !== 0 as a silent retry,
    // so a persistent auth failure only surfaced as a generic timeout.
    // After the fix, the first non-zero code throws immediately.
    await writeConfig({
      providers: {
        a2e: {
          apiKey: 'quota-exceeded-key',
          baseUrl: TEST_A2E_BASE_URL,
        },
      },
    });

    const mockAudioUrl = 'https://cdn.a2e.ai/tts/video_speech2.wav';
    const mockTaskId = '66f1234567890abcdef88888';

    const fetchMock = vi.fn(async (input: unknown, _init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/send_tts`) {
        return new Response(JSON.stringify({ code: 0, data: mockAudioUrl }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/generate`) {
        return new Response(
          JSON.stringify({ code: 0, data: { _id: mockTaskId } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/list`) {
        // Simulate a persistent non-zero code (e.g. quota exceeded).
        return new Response(
          JSON.stringify({ code: 401, msg: 'quota exceeded' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch URL: ${urlStr}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-fail-fast-code',
        surface: 'video',
        model: 'a2e-avatar-video',
        voice: '507f1f77bcf86cd799439011',
        prompt: 'Fail fast on code error.',
        output: 'fail-fast-code.mp4',
      }),
    ).rejects.toThrow('A2E video poll API error 401: quota exceeded');
  });

  it('fails fast when the A2E list poll fetch rejects (e.g. transport-level failure)', async () => {
    // Regression test: the old loop swallowed fetch rejections and continued to retry,
    // causing a 10-minute hang.
    // After the fix, the fetch rejection propagates immediately.
    await writeConfig({
      providers: {
        a2e: {
          apiKey: 'test-key',
          baseUrl: TEST_A2E_BASE_URL,
        },
      },
    });

    const mockAudioUrl = 'https://cdn.a2e.ai/tts/video_speech3.wav';
    const mockTaskId = '66f1234567890abcdef77777';

    const fetchMock = vi.fn(async (input: unknown, _init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/send_tts`) {
        return new Response(JSON.stringify({ code: 0, data: mockAudioUrl }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/generate`) {
        return new Response(
          JSON.stringify({ code: 0, data: { _id: mockTaskId } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (urlStr === `${TEST_A2E_BASE_URL}/api/v1/video/list`) {
        // Simulate a transport-level error (e.g. DNS / host unreachable)
        throw new TypeError('fetch failed');
      }
      throw new Error(`Unexpected fetch URL: ${urlStr}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-fail-fast-transport',
        surface: 'video',
        model: 'a2e-avatar-video',
        voice: '507f1f77bcf86cd799439011',
        prompt: 'Fail fast on transport failure.',
        output: 'fail-fast-transport.mp4',
      }),
    ).rejects.toThrow('fetch failed');
  });

  it('fails fast when image input is provided to A2E video', async () => {
    await writeConfig({
      providers: {
        a2e: {
          apiKey: 'test-key',
          baseUrl: TEST_A2E_BASE_URL,
        },
      },
    });

    const projectDir = path.join(projectsRoot, 'project-a2e-i2v');
    await mkdir(projectDir, { recursive: true });
    const dummyImagePath = path.join(projectDir, 'input.png');
    await writeFile(dummyImagePath, Buffer.from([1, 2, 3]));

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-a2e-i2v',
        surface: 'video',
        model: 'a2e-avatar-video',
        voice: '507f1f77bcf86cd799439011',
        prompt: 'Should fail with image.',
        image: 'input.png',
        output: 'fail-i2v.mp4',
      }),
    ).rejects.toThrow('A2E video generator does not support image-to-video (i2v) generation');
  });

  it('fails fast when A2E voice ID is custom: or user: (empty voice ID)', async () => {
    await writeConfig({
      providers: {
        a2e: {
          apiKey: 'test-key',
          baseUrl: TEST_A2E_BASE_URL,
        },
      },
    });

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-a2e-empty-voice',
        surface: 'audio',
        model: 'a2e-tts',
        audioKind: 'speech',
        voice: 'custom:',
        prompt: 'Should fail with empty voice.',
        output: 'fail-voice.wav',
      }),
    ).rejects.toThrow('A2E voice ID cannot be empty');

    await expect(
      generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'project-a2e-empty-anchor',
        surface: 'video',
        model: 'a2e-avatar-video',
        voice: 'user:  ',
        prompt: 'Should fail with empty anchor.',
        output: 'fail-anchor.mp4',
      }),
    ).rejects.toThrow('A2E Avatar/Anchor ID cannot be empty');
  });
});
