import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../../src/media/index.js';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';

describe('Fal image generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  let projectDir: string;
  const realFetch = globalThis.fetch;
  const originalFalKey = process.env.FAL_KEY;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-fal-media-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    projectDir = path.join(projectsRoot, 'project-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'reference.png'), Buffer.from(PNG_BASE64, 'base64'));
    await writeFile(path.join(projectDir, 'style.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    process.env.FAL_KEY = 'fal-test-key';
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
    if (originalFalKey == null) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = originalFalKey;
    if (originalMediaConfigDir == null) delete process.env.OD_MEDIA_CONFIG_DIR;
    else process.env.OD_MEDIA_CONFIG_DIR = originalMediaConfigDir;
    if (originalDataDir == null) delete process.env.OD_DATA_DIR;
    else process.env.OD_DATA_DIR = originalDataDir;
    await rm(root, { recursive: true, force: true });
  });

  function jsonResponse(data: unknown) {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  function mockSuccessfulFalRequest() {
    return vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          request_id: 'fal-request-1',
          status_url: 'https://queue.fal.run/requests/fal-request-1/status',
          response_url: 'https://queue.fal.run/requests/fal-request-1',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ status: 'COMPLETED' }))
      .mockResolvedValueOnce(
        jsonResponse({ images: [{ url: 'https://fal.media.example/result.png' }] }),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from(PNG_BASE64, 'base64'), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      );
  }

  it('sends Seedream edit references as image_urls', async () => {
    const fetchMock = mockSuccessfulFalRequest();
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'fal-ai/bytedance/seedream/v4/edit',
      prompt: 'Refine this rainy city scene.',
      aspect: '16:9',
      image: 'reference.png',
      images: ['style.jpg'],
      output: 'seedream-edit.png',
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://queue.fal.run/fal-ai/bytedance/seedream/v4/edit');
    expect(init?.headers).toMatchObject({ authorization: 'Key fal-test-key' });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      prompt: 'Refine this rainy city scene.',
      image_urls: [
        `data:image/png;base64,${PNG_BASE64}`,
        'data:image/jpeg;base64,/9j/2Q==',
      ],
    });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('image_url');
  });

  it('preserves singular image_url for other Fal endpoints', async () => {
    const fetchMock = mockSuccessfulFalRequest();
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'fal-ai/flux/dev/image-to-image',
      prompt: 'Keep the composition and change the lighting.',
      image: 'reference.png',
      output: 'flux-edit.png',
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.image_url).toBe(`data:image/png;base64,${PNG_BASE64}`);
    expect(body).not.toHaveProperty('image_urls');
  });
});
