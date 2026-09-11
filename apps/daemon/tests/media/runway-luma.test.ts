import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../../src/media/index.js';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=',
  'base64',
);
const MP4_BYTES = Buffer.from('fake-mp4-bytes');

describe('runway + luma media BYOK', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-runway-luma-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    for (const key of [
      'OD_MEDIA_CONFIG_DIR',
      'OD_DATA_DIR',
      'OD_RUNWAY_API_KEY',
      'RUNWAYML_API_SECRET',
      'RUNWAY_API_SECRET',
      'OD_LUMA_API_KEY',
      'LUMAAI_API_KEY',
      'LUMA_API_KEY',
      'OD_RUNWAY_MAX_POLL_MS',
      'OD_LUMA_MAX_POLL_MS',
      'OD_MEDIA_ALLOW_STUBS',
    ]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.OD_MEDIA_ALLOW_STUBS = '0';
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  });

  it('renders Runway stills via text_to_image + task poll', async () => {
    process.env.RUNWAYML_API_SECRET = 'runway-test-secret';
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.dev.runwayml.com/v1/text_to_image') {
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer runway-test-secret',
          'X-Runway-Version': '2024-11-06',
        });
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          model: 'gen4_image',
          promptText: 'A matte ceramic mug on oak',
          ratio: '1920:1080',
        });
        return new Response(JSON.stringify({ id: 'task_img_1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.dev.runwayml.com/v1/tasks/task_img_1') {
        pollCount += 1;
        if (pollCount === 1) {
          return new Response(JSON.stringify({ id: 'task_img_1', status: 'RUNNING' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          id: 'task_img_1',
          status: 'SUCCEEDED',
          output: ['https://cdn.example/runway.png'],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://cdn.example/runway.png') {
        return new Response(PNG_BYTES, { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: TimerHandler) => {
      if (typeof fn === 'function') fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'runway-gen-image',
      prompt: 'A matte ceramic mug on oak',
      aspect: '16:9',
      output: 'runway.png',
    });

    expect(result.providerId).toBe('runway');
    expect(result.name).toBe('runway.png');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', result.name));
    expect(bytes.equals(PNG_BYTES)).toBe(true);
    expect(result.providerNote).toContain('runway/gen4_image');
  });

  it('renders Runway Gen-4.5 video via text_to_video + task poll', async () => {
    process.env.OD_RUNWAY_API_KEY = 'runway-video-key';
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.dev.runwayml.com/v1/text_to_video') {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          model: 'gen4.5',
          promptText: 'Waves on black rock',
          ratio: '1280:720',
          duration: 5,
        });
        return new Response(JSON.stringify({ id: 'task_vid_1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.dev.runwayml.com/v1/tasks/task_vid_1') {
        pollCount += 1;
        if (pollCount === 1) {
          return new Response(JSON.stringify({ id: 'task_vid_1', status: 'PENDING' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          id: 'task_vid_1',
          status: 'SUCCEEDED',
          output: ['https://cdn.example/runway.mp4'],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://cdn.example/runway.mp4') {
        return new Response(MP4_BYTES, { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: TimerHandler) => {
      if (typeof fn === 'function') fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'runway-gen-4.5',
      prompt: 'Waves on black rock',
      aspect: '16:9',
      length: 5,
      output: 'runway.mp4',
    });

    expect(result.providerId).toBe('runway');
    expect(result.name).toBe('runway.mp4');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', result.name));
    expect(bytes.equals(MP4_BYTES)).toBe(true);
  });

  it('renders Luma Ray-2 video via generations poll', async () => {
    process.env.LUMAAI_API_KEY = 'luma-test-key';
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.lumalabs.ai/dream-machine/v1/generations') {
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer luma-test-key',
        });
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          prompt: 'Misty valley sunrise',
          model: 'ray-2',
          aspect_ratio: '16:9',
          duration: '5s',
        });
        return new Response(JSON.stringify({ id: 'gen_1', state: 'dreaming' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.lumalabs.ai/dream-machine/v1/generations/gen_1') {
        pollCount += 1;
        if (pollCount === 1) {
          return new Response(JSON.stringify({ id: 'gen_1', state: 'dreaming' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          id: 'gen_1',
          state: 'completed',
          assets: { video: 'https://cdn.example/luma.mp4' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://cdn.example/luma.mp4') {
        return new Response(MP4_BYTES, { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: TimerHandler) => {
      if (typeof fn === 'function') fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'luma-ray-2',
      prompt: 'Misty valley sunrise',
      aspect: '16:9',
      length: 5,
      output: 'luma.mp4',
    });

    expect(result.providerId).toBe('luma');
    expect(result.name).toBe('luma.mp4');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', result.name));
    expect(bytes.equals(MP4_BYTES)).toBe(true);
    expect(result.providerNote).toContain('luma/ray-2');
  });

  it('fails Runway poll when task status is CANCELLED', async () => {
    process.env.RUNWAYML_API_SECRET = 'runway-test-secret';
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://api.dev.runwayml.com/v1/text_to_image') {
        return new Response(JSON.stringify({ id: 'task_cancel_1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.dev.runwayml.com/v1/tasks/task_cancel_1') {
        return new Response(JSON.stringify({
          id: 'task_cancel_1',
          status: 'CANCELLED',
          failure: 'user cancelled',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: TimerHandler) => {
      if (typeof fn === 'function') fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'runway-gen-image',
      prompt: 'Should cancel',
      output: 'cancel.png',
    })).rejects.toThrow(/runway task cancelled/i);
  });

  it('fails Luma when completed response has no assets.video', async () => {
    process.env.LUMAAI_API_KEY = 'luma-test-key';
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://api.lumalabs.ai/dream-machine/v1/generations') {
        return new Response(JSON.stringify({ id: 'gen_empty', state: 'dreaming' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.lumalabs.ai/dream-machine/v1/generations/gen_empty') {
        return new Response(JSON.stringify({
          id: 'gen_empty',
          state: 'completed',
          assets: {},
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: TimerHandler) => {
      if (typeof fn === 'function') fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'luma-ray-2',
      prompt: 'Empty output',
      output: 'empty.mp4',
    })).rejects.toThrow(/completed with no assets\.video URL/);
  });

  it('rejects Luma i2v when --image is a local project file', async () => {
    process.env.LUMAAI_API_KEY = 'luma-test-key';
    const projectDir = path.join(projectsRoot, 'project-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'frame.png'), PNG_BYTES);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'luma-ray-2',
      prompt: 'Animate this frame',
      image: 'frame.png',
      output: 'i2v.mp4',
    })).rejects.toThrow(/publicly reachable HTTPS image URL/i);
  });

  it('accepts Luma i2v when --image is an HTTPS URL', async () => {
    process.env.LUMAAI_API_KEY = 'luma-test-key';
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.lumalabs.ai/dream-machine/v1/generations') {
        const body = JSON.parse(String(init?.body));
        expect(body.keyframes).toEqual({
          frame0: { type: 'image', url: 'https://cdn.example/start.png' },
        });
        return new Response(JSON.stringify({ id: 'gen_i2v', state: 'dreaming' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://api.lumalabs.ai/dream-machine/v1/generations/gen_i2v') {
        pollCount += 1;
        if (pollCount === 1) {
          return new Response(JSON.stringify({ id: 'gen_i2v', state: 'dreaming' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          id: 'gen_i2v',
          state: 'completed',
          assets: { video: 'https://cdn.example/luma-i2v.mp4' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://cdn.example/luma-i2v.mp4') {
        return new Response(MP4_BYTES, { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: TimerHandler) => {
      if (typeof fn === 'function') fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'luma-ray-2',
      prompt: 'Animate this frame',
      image: 'https://cdn.example/start.png',
      output: 'luma-i2v.mp4',
    });

    expect(result.providerId).toBe('luma');
    expect(result.name).toBe('luma-i2v.mp4');
  });
});
