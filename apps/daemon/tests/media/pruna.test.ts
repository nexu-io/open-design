import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../../src/media/index.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64');
const MP4_BYTES = Buffer.from('000000186674797069736f6d0000020069736f6d', 'hex');

type Call = { url: string; init: RequestInit | undefined };

describe('pruna media generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;
  // PRUNA_API_KEY is the canonical upstream env name, so a developer running
  // the suite on a machine that exports it for the Pruna SDK would otherwise
  // satisfy the no-credential case from the ambient environment.
  const originalPrunaKey = process.env.PRUNA_API_KEY;
  const originalPrunaRequestTimeout = process.env.OD_PRUNA_REQUEST_TIMEOUT_MS;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-pruna-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(path.join(projectsRoot, 'project-1'), { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_MEDIA_MODEL_ALIASES;
    delete process.env.PRUNA_API_KEY;
    delete process.env.OD_PRUNA_REQUEST_TIMEOUT_MS;
    process.env.OD_PRUNA_API_KEY = 'pruna-test-key';
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    delete process.env.OD_PRUNA_API_KEY;
    delete process.env.OD_MEDIA_MODEL_ALIASES;
    if (originalPrunaKey == null) {
      delete process.env.PRUNA_API_KEY;
    } else {
      process.env.PRUNA_API_KEY = originalPrunaKey;
    }
    if (originalPrunaRequestTimeout == null) {
      delete process.env.OD_PRUNA_REQUEST_TIMEOUT_MS;
    } else {
      process.env.OD_PRUNA_REQUEST_TIMEOUT_MS = originalPrunaRequestTimeout;
    }
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

  function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  async function writeMediaConfig(entry: Record<string, unknown>) {
    await writeFile(
      path.join(projectRoot, '.od', 'media-config.json'),
      JSON.stringify({ providers: { pruna: entry } }),
      'utf8',
    );
  }

  /**
   * Stub the Pruna surface: POST /files, POST /predictions,
   * GET /predictions/status/:id, and the authenticated delivery URL.
   * `pollStatuses` drives how many in-flight polls precede success.
   */
  function stubPruna(options: {
    calls: Call[];
    deliveryUrl: string;
    outputBytes: Buffer;
    pollStatuses?: string[];
    submitBody?: Record<string, unknown>;
    uploadUrl?: string;
  }) {
    const remaining = [...(options.pollStatuses ?? [])];
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      options.calls.push({ url, init });
      if (url.endsWith('/files')) {
        return jsonResponse({
          id: 'file-abc123',
          urls: { get: options.uploadUrl ?? 'https://api.pruna.ai/v1/files/file-abc123' },
        });
      }
      if (url.endsWith('/predictions')) {
        return jsonResponse(options.submitBody ?? {
          id: '1zww7deyssrme0csqwr90phzzr',
          model: 'p-image',
          get_url: 'https://api.pruna.ai/v1/predictions/status/1zww7deyssrme0csqwr90phzzr',
        });
      }
      if (url.includes('/predictions/status/')) {
        const next = remaining.shift();
        if (next) return jsonResponse({ status: next, message: 'Generation in progress' });
        return jsonResponse({ status: 'succeeded', generation_url: options.deliveryUrl });
      }
      return new Response(options.outputBytes, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('submits the model in the Model header and the key in apikey, then polls', async () => {
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/abc/output.jpg',
      outputBytes: PNG_BYTES,
      pollStatuses: ['starting', 'processing'],
    });

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'A majestic lion on a rocky cliff at sunset',
      aspect: '16:9',
      output: 'lion.png',
    });

    expect(result.providerId).toBe('pruna');
    expect(result.providerNote).toContain('pruna/p-image');
    expect(result.providerNote).toContain('16:9');

    const submit = calls.find((c) => c.url.endsWith('/predictions'));
    expect(submit?.url).toBe('https://api.pruna.ai/v1/predictions');
    expect(submit?.init?.method).toBe('POST');
    // The model travels in a header, not the body, and the credential is a
    // bare apikey header rather than a Bearer token.
    expect(submit?.init?.headers).toMatchObject({
      apikey: 'pruna-test-key',
      'content-type': 'application/json',
      Model: 'p-image',
    });
    expect(submit?.init?.headers).not.toHaveProperty('authorization');
    // Sync mode is never requested: the docs cap it at 60s and warn about 504s.
    expect(submit?.init?.headers).not.toHaveProperty('Try-Sync');
    expect(JSON.parse(String(submit?.init?.body))).toEqual({
      input: {
        prompt: 'A majestic lion on a rocky cliff at sunset',
        aspect_ratio: '16:9',
      },
    });

    const polls = calls.filter((c) => c.url.includes('/predictions/status/'));
    expect(polls.length).toBe(3);

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'lion.png'));
    expect(bytes.equals(PNG_BYTES)).toBe(true);
  });

  it('sends the apikey header when downloading the delivery URL', async () => {
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/abc/output.jpg',
      outputBytes: PNG_BYTES,
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'A studio photo of a lemon',
      output: 'lemon.png',
    });

    const download = calls.find((c) => c.url.includes('/predictions/delivery/'));
    expect(download).toBeDefined();
    // The delivery endpoint is authenticated; a bare fetch returns 401.
    expect(download?.init?.headers).toMatchObject({ apikey: 'pruna-test-key' });
  });

  it('resolves a root-relative generation_url against the configured base', async () => {
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: '/v1/predictions/delivery/xezq/abc/output.jpg',
      outputBytes: PNG_BYTES,
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'A single red apple',
      output: 'apple.png',
    });

    const download = calls.find((c) => c.url.includes('/predictions/delivery/'));
    expect(download?.url).toBe('https://api.pruna.ai/v1/predictions/delivery/xezq/abc/output.jpg');
  });

  it('strips the -pruna disambiguation suffix from the wire model name', async () => {
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/abc/output.jpg',
      outputBytes: PNG_BYTES,
    });

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'flux-dev-pruna',
      prompt: 'A quiet harbour at dawn',
      output: 'harbour.png',
    });

    const submit = calls.find((c) => c.url.endsWith('/predictions'));
    expect(submit?.init?.headers).toMatchObject({ Model: 'flux-dev' });
    expect(result.providerNote).toContain('pruna/flux-dev');
    expect(result.providerNote).not.toContain('flux-dev-pruna');
  });

  it('lets a configured model alias override the suffix mapping', async () => {
    process.env.OD_MEDIA_MODEL_ALIASES = JSON.stringify({ 'flux-dev-pruna': 'z-image-turbo' });
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/abc/output.jpg',
      outputBytes: PNG_BYTES,
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'flux-dev-pruna',
      prompt: 'A quiet harbour at dawn',
      output: 'aliased.png',
    });

    const submit = calls.find((c) => c.url.endsWith('/predictions'));
    expect(submit?.init?.headers).toMatchObject({ Model: 'z-image-turbo' });
  });

  it('uploads reference images and passes them as an images array for p-image-edit', async () => {
    const refAbs = path.join(projectsRoot, 'project-1', 'ref.png');
    await writeFile(refAbs, PNG_BYTES);
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/abc/output.jpg',
      outputBytes: PNG_BYTES,
      uploadUrl: 'https://api.pruna.ai/v1/files/file-xyz789',
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image-edit',
      prompt: 'Turn this into a watercolour painting',
      image: 'ref.png',
      output: 'edited.png',
    });

    const upload = calls.find((c) => c.url.endsWith('/files'));
    expect(upload?.init?.method).toBe('POST');
    expect(upload?.init?.headers).toMatchObject({ apikey: 'pruna-test-key' });
    // Multipart: the body must be FormData, and content-type must be left to
    // fetch so the boundary is generated.
    expect(upload?.init?.body).toBeInstanceOf(FormData);
    expect(upload?.init?.headers).not.toHaveProperty('content-type');

    const submit = calls.find((c) => c.url.endsWith('/predictions'));
    const body = JSON.parse(String(submit?.init?.body));
    // The API has no data-URL input, so the uploaded URL must replace it.
    expect(body.input.images).toEqual(['https://api.pruna.ai/v1/files/file-xyz789']);
    expect(JSON.stringify(body)).not.toContain('data:image');
    // The dispatcher's imageRefs already leads with the primary --image, so
    // reading both fields would upload the same file twice.
    expect(calls.filter((c) => c.url.endsWith('/files')).length).toBe(1);
  });

  it('uploads every distinct reference image once for a multi-image edit', async () => {
    await writeFile(path.join(projectsRoot, 'project-1', 'a.png'), PNG_BYTES);
    await writeFile(path.join(projectsRoot, 'project-1', 'b.png'), PNG_BYTES);
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/abc/output.jpg',
      outputBytes: PNG_BYTES,
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image-edit',
      prompt: 'Blend these two frames',
      image: 'a.png',
      // 'a.png' repeated: the dispatcher dedupes by absolute path.
      images: ['a.png', 'b.png'],
      output: 'blended.png',
    });

    expect(calls.filter((c) => c.url.endsWith('/files')).length).toBe(2);
    const submit = calls.find((c) => c.url.endsWith('/predictions'));
    const body = JSON.parse(String(submit?.init?.body));
    expect(body.input.images).toHaveLength(2);
  });

  it('clamps video duration to the 20s Pruna ceiling and reports the clamp', async () => {
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/abc/output.mp4',
      outputBytes: MP4_BYTES,
      submitBody: { id: 'vid1', model: 'p-video', get_url: 'https://api.pruna.ai/v1/predictions/status/vid1' },
    });

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'p-video',
      prompt: 'A sports car drifting through a neon-lit city',
      aspect: '16:9',
      // VIDEO_LENGTHS_SEC allows 30; Pruna caps at 20.
      length: 30,
      resolution: '1080p',
      output: 'car.mp4',
    });

    const submit = calls.find((c) => c.url.endsWith('/predictions'));
    const body = JSON.parse(String(submit?.init?.body));
    expect(body.input.duration).toBe(20);
    expect(body.input.resolution).toBe('1080p');
    expect(body.input.aspect_ratio).toBe('16:9');
    expect(result.providerNote).toContain('clamped to 20s');
  });

  it('omits aspect_ratio for image-to-video because the API ignores it', async () => {
    const refAbs = path.join(projectsRoot, 'project-1', 'still.png');
    await writeFile(refAbs, PNG_BYTES);
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/abc/output.mp4',
      outputBytes: MP4_BYTES,
      submitBody: { id: 'vid2', model: 'p-video', get_url: 'https://api.pruna.ai/v1/predictions/status/vid2' },
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'p-video',
      prompt: 'The camera slowly pushes in',
      aspect: '9:16',
      image: 'still.png',
      output: 'push-in.mp4',
    });

    const submit = calls.find((c) => c.url.endsWith('/predictions'));
    const body = JSON.parse(String(submit?.init?.body));
    expect(body.input.image).toBe('https://api.pruna.ai/v1/files/file-abc123');
    expect(body.input).not.toHaveProperty('aspect_ratio');
  });

  it('sends one reference to a single-image model and says so', async () => {
    await writeFile(path.join(projectsRoot, 'project-1', 'a.png'), PNG_BYTES);
    await writeFile(path.join(projectsRoot, 'project-1', 'b.png'), PNG_BYTES);
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/abc/output.jpg',
      outputBytes: PNG_BYTES,
    });

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      // p-image has a single `image` input, so the second reference cannot be
      // used — it must not be uploaded either.
      model: 'p-image',
      prompt: 'Restyle this frame',
      image: 'a.png',
      images: ['b.png'],
      output: 'single-ref.png',
    });

    expect(calls.filter((c) => c.url.endsWith('/files')).length).toBe(1);
    const submit = calls.find((c) => c.url.endsWith('/predictions'));
    const body = JSON.parse(String(submit?.init?.body));
    expect(body.input.image).toBe('https://api.pruna.ai/v1/files/file-abc123');
    expect(body.input).not.toHaveProperty('images');
    expect(result.providerNote).toContain('2 references given, 1 sent');
  });

  it('preserves a path prefix on a custom base URL when resolving delivery URLs', async () => {
    await writeFile(path.join(projectRoot, '.od', 'media-config.json'), JSON.stringify({
      providers: { pruna: { baseUrl: 'https://gateway.example/pruna/v1' } },
    }), 'utf8');
    const calls: Call[] = [];
    stubPruna({
      calls,
      // Root-relative, as p-image returns it. Resolving against the origin
      // alone would drop the gateway's /pruna prefix and 404.
      deliveryUrl: '/v1/predictions/delivery/xezq/abc/output.jpg',
      outputBytes: PNG_BYTES,
      submitBody: { id: 'gw1', get_url: '/v1/predictions/status/gw1' },
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'A lantern in fog',
      output: 'gateway.png',
    });

    expect(calls.find((c) => c.url.endsWith('/predictions'))?.url)
      .toBe('https://gateway.example/pruna/v1/predictions');
    expect(calls.find((c) => c.url.includes('/predictions/status/'))?.url)
      .toBe('https://gateway.example/pruna/v1/predictions/status/gw1');
    expect(calls.find((c) => c.url.includes('/predictions/delivery/'))?.url)
      .toBe('https://gateway.example/pruna/v1/predictions/delivery/xezq/abc/output.jpg');
  });

  it('accepts a submit response that already succeeded, without polling', async () => {
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'unused',
      outputBytes: PNG_BYTES,
      // A fast model can settle inside the submit call even without Try-Sync.
      submitBody: {
        status: 'succeeded',
        generation_url: 'https://api.pruna.ai/v1/predictions/delivery/xezq/fast/output.jpg',
      },
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'A fast result',
      output: 'fast.png',
    });

    expect(calls.filter((c) => c.url.includes('/predictions/status/')).length).toBe(0);
    expect(calls.find((c) => c.url.includes('/predictions/delivery/'))?.url)
      .toBe('https://api.pruna.ai/v1/predictions/delivery/xezq/fast/output.jpg');
  });

  it('rejects a succeeded prediction that carries no generation_url', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith('/predictions')) {
        return jsonResponse({ id: 'nourl', get_url: 'https://api.pruna.ai/v1/predictions/status/nourl' });
      }
      return jsonResponse({ status: 'succeeded' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'Missing output',
      output: 'missing.png',
    })).rejects.toThrow(/succeeded without generation_url/);
  });

  it('rejects a zero-byte delivery instead of writing an empty file', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith('/predictions')) {
        return jsonResponse({
          status: 'succeeded',
          generation_url: 'https://api.pruna.ai/v1/predictions/delivery/xezq/empty/output.jpg',
        });
      }
      return new Response(Buffer.alloc(0), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'Empty delivery',
      output: 'empty.png',
    })).rejects.toThrow(/download returned 0 bytes/);
  });

  it('rejects a cross-origin status URL before sending the API key', async () => {
    const calls: Call[] = [];
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/predictions')) {
        return jsonResponse({
          id: 'cross-origin-status',
          get_url: 'https://attacker.example/status/cross-origin-status',
        });
      }
      return jsonResponse({
        status: 'succeeded',
        generation_url: 'https://attacker.example/output.jpg',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'Do not leak the key',
      output: 'blocked-status.png',
    })).rejects.toThrow(/status URL.*origin/i);
    expect(calls.some((call) => call.url.startsWith('https://attacker.example'))).toBe(false);
  });

  it('rejects a cross-origin delivery URL before sending the API key', async () => {
    const calls: Call[] = [];
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith('/predictions')) {
        return jsonResponse({
          status: 'succeeded',
          generation_url: 'https://attacker.example/output.jpg',
        });
      }
      return new Response(PNG_BYTES, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'Do not leak the key',
      output: 'blocked-delivery.png',
    })).rejects.toThrow(/delivery URL.*origin/i);
    expect(calls.some((call) => call.url.startsWith('https://attacker.example'))).toBe(false);
  });

  it('pins redirect:error and a timeout signal on every authenticated request', async () => {
    await writeFile(path.join(projectsRoot, 'project-1', 'ref.png'), PNG_BYTES);
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/guarded/output.jpg',
      outputBytes: PNG_BYTES,
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image-edit',
      prompt: 'Guard every request',
      image: 'ref.png',
      output: 'guarded.png',
    });

    expect(calls.map((call) => call.url)).toEqual(expect.arrayContaining([
      'https://api.pruna.ai/v1/files',
      'https://api.pruna.ai/v1/predictions',
      'https://api.pruna.ai/v1/predictions/status/1zww7deyssrme0csqwr90phzzr',
      'https://api.pruna.ai/v1/predictions/delivery/xezq/guarded/output.jpg',
    ]));
    for (const call of calls) {
      expect(call.init?.redirect, call.url).toBe('error');
      expect(call.init?.signal, call.url).toBeInstanceOf(AbortSignal);
    }
  });

  it('rejects a non-HTTPS Pruna base URL before making a request', async () => {
    await writeMediaConfig({ baseUrl: 'http://gateway.example/pruna/v1' });
    const fetchMock = vi.fn(async () => {
      throw new Error('network should not be reached for an insecure base URL');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'HTTPS only',
      output: 'https-only.png',
    })).rejects.toThrow(/Pruna base URL.*HTTPS/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized JSON response without buffering it as provider data', async () => {
    const fetchMock = vi.fn(async () => new Response('x'.repeat(1_100_000), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'Bound JSON responses',
      output: 'bounded-json.png',
    })).rejects.toThrow(/Pruna submit response exceeds/i);
  });

  it('rejects a delivery whose declared size exceeds the output cap', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith('/predictions')) {
        return jsonResponse({
          status: 'succeeded',
          generation_url: 'https://api.pruna.ai/v1/predictions/delivery/xezq/huge/output.jpg',
        });
      }
      return new Response(PNG_BYTES, {
        status: 200,
        headers: { 'content-length': String(1024 * 1024 * 1024) },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'Bound delivery responses',
      output: 'bounded-delivery.png',
    })).rejects.toThrow(/Pruna image response exceeds/i);
  });

  it('rejects more than five Pruna references before reading or uploading them', async () => {
    for (const name of ['a.png', 'b.png', 'c.png', 'd.png', 'e.png', 'f.png']) {
      await writeFile(path.join(projectsRoot, 'project-1', name), PNG_BYTES);
    }
    const fetchMock = vi.fn(async () => {
      throw new Error('network should not be reached for too many references');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image-edit',
      prompt: 'Too many inputs',
      image: 'a.png',
      images: ['b.png', 'c.png', 'd.png', 'e.png', 'f.png'],
      output: 'too-many.png',
    })).rejects.toThrow(/Pruna accepts at most 5 uploaded references per request; received 6/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows five distinct references in the CLI body shape without double-counting the primary', async () => {
    for (const name of ['a.png', 'b.png', 'c.png', 'd.png', 'e.png']) {
      await writeFile(path.join(projectsRoot, 'project-1', name), PNG_BYTES);
    }
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/five/output.jpg',
      outputBytes: PNG_BYTES,
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image-edit',
      prompt: 'Five distinct references',
      image: 'a.png',
      // The CLI sends the primary in both fields.
      images: ['a.png', 'b.png', 'c.png', 'd.png', 'e.png'],
      output: 'five.png',
    });

    expect(calls.filter((call) => call.url.endsWith('/files'))).toHaveLength(5);
  });

  it('uses qwen-image-edit-plus image array and match-input default', async () => {
    await writeFile(path.join(projectsRoot, 'project-1', 'a.png'), PNG_BYTES);
    await writeFile(path.join(projectsRoot, 'project-1', 'b.png'), PNG_BYTES);
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/qwen/output.webp',
      outputBytes: PNG_BYTES,
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'qwen-image-edit-plus-pruna',
      prompt: 'Transfer the pose',
      image: 'a.png',
      images: ['b.png'],
      output: 'qwen.png',
    });

    const submit = calls.find((call) => call.url.endsWith('/predictions'));
    const input = JSON.parse(String(submit?.init?.body)).input;
    expect(input.image).toEqual([
      'https://api.pruna.ai/v1/files/file-abc123',
      'https://api.pruna.ai/v1/files/file-abc123',
    ]);
    expect(input).not.toHaveProperty('images');
    expect(input.aspect_ratio).toBe('match_input_image');
  });

  it('rejects more than two references for qwen-image-edit-plus before upload', async () => {
    for (const name of ['a.png', 'b.png', 'c.png']) {
      await writeFile(path.join(projectsRoot, 'project-1', name), PNG_BYTES);
    }
    const fetchMock = vi.fn(async () => {
      throw new Error('network should not be reached above the Qwen limit');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'qwen-image-edit-plus-pruna',
      prompt: 'Too many Qwen references',
      image: 'a.png',
      images: ['b.png', 'c.png'],
      output: 'qwen-too-many.png',
    })).rejects.toThrow(/qwen-image-edit-plus accepts at most 2 reference images/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { length: 3, numFrames: 81, fps: 27 },
    { length: 5, numFrames: 85, fps: 17 },
    { length: 10, numFrames: 90, fps: 9 },
    { length: 15, numFrames: 90, fps: 6 },
  ])('maps the $length second Wan bucket to $numFrames frames at $fps fps', async ({
    length,
    numFrames,
    fps,
  }) => {
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: `https://api.pruna.ai/v1/predictions/delivery/xezq/wan-${length}/output.mp4`,
      outputBytes: MP4_BYTES,
      submitBody: { id: `wan-${length}`, get_url: `/v1/predictions/status/wan-${length}` },
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'wan-t2v-pruna',
      prompt: 'Map the duration',
      length,
      output: `wan-${length}.mp4`,
    });

    const submit = calls.find((call) => call.url.endsWith('/predictions'));
    const input = JSON.parse(String(submit?.init?.body)).input;
    expect(input.num_frames).toBe(numFrames);
    expect(input.frames_per_second).toBe(fps);
    expect(input).not.toHaveProperty('duration');
  });

  it('shapes wan-t2v with frames and fps instead of p-video duration', async () => {
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/wan-t2v/output.mp4',
      outputBytes: MP4_BYTES,
      submitBody: { id: 'wan-t2v', get_url: '/v1/predictions/status/wan-t2v' },
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'wan-t2v-pruna',
      prompt: 'A cinematic beach drive',
      aspect: '9:16',
      length: 8,
      resolution: '480p',
      output: 'wan-t2v.mp4',
    });

    const submit = calls.find((call) => call.url.endsWith('/predictions'));
    expect(submit?.init?.headers).toMatchObject({ Model: 'wan-t2v' });
    expect(JSON.parse(String(submit?.init?.body))).toEqual({
      input: {
        prompt: 'A cinematic beach drive',
        num_frames: 88,
        resolution: '480p',
        aspect_ratio: '9:16',
        frames_per_second: 11,
      },
    });
  });

  it('shapes wan-i2v with its exact default frame contract', async () => {
    await writeFile(path.join(projectsRoot, 'project-1', 'still.png'), PNG_BYTES);
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/wan-i2v/output.mp4',
      outputBytes: MP4_BYTES,
      submitBody: { id: 'wan-i2v', get_url: '/v1/predictions/status/wan-i2v' },
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'wan-i2v-pruna',
      prompt: 'Animate the still',
      images: ['still.png'],
      output: 'wan-i2v.mp4',
    });

    const submit = calls.find((call) => call.url.endsWith('/predictions'));
    expect(submit?.init?.headers).toMatchObject({ Model: 'wan-i2v' });
    expect(JSON.parse(String(submit?.init?.body))).toEqual({
      input: {
        prompt: 'Animate the still',
        image: 'https://api.pruna.ai/v1/files/file-abc123',
        num_frames: 81,
        resolution: '480p',
        frames_per_second: 16,
      },
    });
  });

  it('caps a 30s Wan request at the longest valid frame duration', async () => {
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/wan-long/output.mp4',
      outputBytes: MP4_BYTES,
      submitBody: { id: 'wan-long', get_url: '/v1/predictions/status/wan-long' },
    });

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'wan-t2v-pruna',
      prompt: 'A long cinematic shot',
      length: 30,
      resolution: '1080p',
      output: 'wan-long.mp4',
    });

    const submit = calls.find((call) => call.url.endsWith('/predictions'));
    expect(JSON.parse(String(submit?.init?.body))).toEqual({
      input: {
        prompt: 'A long cinematic shot',
        num_frames: 121,
        resolution: '720p',
        aspect_ratio: '16:9',
        frames_per_second: 5,
      },
    });
    expect(result.providerNote).toContain('requested 30s → capped to 24.2s');
  });

  it.each([
    { surface: 'image' as const, model: 'p-image-edit', output: 'missing-edit.png' },
    { surface: 'image' as const, model: 'qwen-image-edit-plus-pruna', output: 'missing-qwen.png' },
    { surface: 'video' as const, model: 'wan-i2v-pruna', output: 'missing-i2v.mp4' },
  ])('rejects $model without a reference image before making a request', async ({ surface, model, output }) => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network should not be reached without a required image');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface,
      model,
      prompt: 'Missing required input',
      output,
    })).rejects.toThrow(/requires at least one reference image/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses match_input_image for p-image-edit when no aspect was requested', async () => {
    await writeFile(path.join(projectsRoot, 'project-1', 'ref.png'), PNG_BYTES);
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/edit-default/output.jpg',
      outputBytes: PNG_BYTES,
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image-edit',
      prompt: 'Keep the input framing',
      image: 'ref.png',
      output: 'match-input.png',
    });

    const submit = calls.find((call) => call.url.endsWith('/predictions'));
    expect(JSON.parse(String(submit?.init?.body)).input.aspect_ratio).toBe('match_input_image');
  });

  it('preserves an explicit aspect ratio for p-image-edit', async () => {
    await writeFile(path.join(projectsRoot, 'project-1', 'ref.png'), PNG_BYTES);
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/edit-aspect/output.jpg',
      outputBytes: PNG_BYTES,
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image-edit',
      prompt: 'Crop deliberately',
      aspect: '16:9',
      image: 'ref.png',
      output: 'explicit-aspect.png',
    });

    const submit = calls.find((call) => call.url.endsWith('/predictions'));
    expect(JSON.parse(String(submit?.init?.body)).input.aspect_ratio).toBe('16:9');
  });

  it('uses the custom model configured in Settings', async () => {
    await writeMediaConfig({ model: 'z-image-turbo' });
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/custom/output.jpg',
      outputBytes: PNG_BYTES,
    });

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'Use the configured model',
      output: 'custom-model.png',
    });

    const submit = calls.find((call) => call.url.endsWith('/predictions'));
    expect(submit?.init?.headers).toMatchObject({ Model: 'z-image-turbo' });
    expect(result.providerNote).toContain('pruna/z-image-turbo');
  });

  it('keeps the full custom base path for root-relative status and file URLs', async () => {
    await writeMediaConfig({ baseUrl: 'https://gateway.example/pruna/v1' });
    const calls: Call[] = [];
    stubPruna({
      calls,
      deliveryUrl: '/files/output.jpg',
      outputBytes: PNG_BYTES,
      submitBody: { id: 'gw-short', get_url: '/predictions/status/gw-short' },
    });

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'Preserve the gateway path',
      output: 'gateway-short.png',
    });

    expect(calls.find((call) => call.url.includes('/predictions/status/'))?.url)
      .toBe('https://gateway.example/pruna/v1/predictions/status/gw-short');
    expect(calls.find((call) => call.url.includes('/files/output.jpg'))?.url)
      .toBe('https://gateway.example/pruna/v1/files/output.jpg');
  });

  it('falls back safely for unsupported aspect and resolution values', async () => {
    const imageCalls: Call[] = [];
    stubPruna({
      calls: imageCalls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/fallback-image/output.jpg',
      outputBytes: PNG_BYTES,
    });
    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'Fallback image',
      aspect: '21:9',
      output: 'fallback-image.png',
    });
    const imageSubmit = imageCalls.find((call) => call.url.endsWith('/predictions'));
    expect(JSON.parse(String(imageSubmit?.init?.body)).input.aspect_ratio).toBe('1:1');

    const videoCalls: Call[] = [];
    stubPruna({
      calls: videoCalls,
      deliveryUrl: 'https://api.pruna.ai/v1/predictions/delivery/xezq/fallback-video/output.mp4',
      outputBytes: MP4_BYTES,
      submitBody: { id: 'fallback-video', get_url: '/v1/predictions/status/fallback-video' },
    });
    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'p-video',
      prompt: 'Fallback video',
      resolution: '4k',
      output: 'fallback-video.mp4',
    });
    const videoSubmit = videoCalls.find((call) => call.url.endsWith('/predictions'));
    expect(JSON.parse(String(videoSubmit?.init?.body)).input.resolution).toBe('720p');
  });

  it('surfaces upload, poll, and download HTTP failures clearly', async () => {
    await writeFile(path.join(projectsRoot, 'project-1', 'ref.png'), PNG_BYTES);
    const uploadFetch = vi.fn(async () => new Response('upload denied', { status: 401 }));
    vi.stubGlobal('fetch', uploadFetch);
    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image-edit',
      prompt: 'Upload failure',
      image: 'ref.png',
      output: 'upload-failure.png',
    })).rejects.toThrow(/Pruna file upload 401/i);

    const pollFetch = vi.fn(async (input: unknown) => {
      const url = String(input);
      return url.endsWith('/predictions')
        ? jsonResponse({ id: 'poll-failure', get_url: '/v1/predictions/status/poll-failure' })
        : new Response('poll denied', { status: 401 });
    });
    vi.stubGlobal('fetch', pollFetch);
    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'Poll failure',
      output: 'poll-failure.png',
    })).rejects.toThrow(/Pruna poll 401/i);

    const downloadFetch = vi.fn(async (input: unknown) => {
      const url = String(input);
      return url.endsWith('/predictions')
        ? jsonResponse({
            status: 'succeeded',
            generation_url: '/v1/predictions/delivery/xezq/denied/output.jpg',
          })
        : new Response('download denied', { status: 401 });
    });
    vi.stubGlobal('fetch', downloadFetch);
    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'Download failure',
      output: 'download-failure.png',
    })).rejects.toThrow(/Pruna image download 401/i);
  });

  it('surfaces a failed prediction instead of polling to the ceiling', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith('/predictions')) {
        return jsonResponse({ id: 'bad1', get_url: 'https://api.pruna.ai/v1/predictions/status/bad1' });
      }
      return jsonResponse({
        status: 'failed',
        message: 'Prediction failed',
        error: 'Number of samples, -5, must be non-negative.',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'A broken request',
      output: 'broken.png',
    })).rejects.toThrow(/pruna task failed: Number of samples/);
  });

  it('refuses to generate without a credential', async () => {
    delete process.env.OD_PRUNA_API_KEY;
    const fetchMock = vi.fn(async () => {
      throw new Error('network should not be reached without a key');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'p-image',
      prompt: 'No key configured',
      output: 'nokey.png',
    })).rejects.toThrow(/OD_PRUNA_API_KEY.*PRUNA_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
