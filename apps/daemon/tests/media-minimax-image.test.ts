import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media/index.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';
const TEST_MINIMAX_DEFAULT_BASE_URL = 'https://api.minimax.io';
const TEST_MINIMAX_TTS_BASE_URL = 'https://api.minimaxi.chat/v1';

describe('minimax image generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;
  const originalMinimaxApiKey = process.env.OD_MINIMAX_API_KEY;
  const originalImageBaseUrl = process.env.OD_MINIMAX_IMAGE_BASE_URL;
  const originalMediaModelAliases = process.env.OD_MEDIA_MODEL_ALIASES;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-minimax-image-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_MINIMAX_IMAGE_BASE_URL;
    delete process.env.OD_MEDIA_MODEL_ALIASES;
    process.env.OD_MINIMAX_API_KEY = 'minimax-test-key';
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    if (originalMinimaxApiKey == null) {
      delete process.env.OD_MINIMAX_API_KEY;
    } else {
      process.env.OD_MINIMAX_API_KEY = originalMinimaxApiKey;
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
    if (originalImageBaseUrl == null) {
      delete process.env.OD_MINIMAX_IMAGE_BASE_URL;
    } else {
      process.env.OD_MINIMAX_IMAGE_BASE_URL = originalImageBaseUrl;
    }
    if (originalMediaModelAliases == null) {
      delete process.env.OD_MEDIA_MODEL_ALIASES;
    } else {
      process.env.OD_MEDIA_MODEL_ALIASES = originalMediaModelAliases;
    }
    await rm(root, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  it('renders MiniMax images through the image_generation endpoint', async () => {
    // Stored credentials.model overrides the catalog id wire-model mapping.
    // Stored credentials.baseUrl is intentionally NOT honored for image
    // (see "ignores credentials.baseUrl for image" test below); the
    // renderer always uses the image-specific host.
    await writeConfig({
      providers: {
        minimax: { model: 'image-01-custom' },
      },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(`${TEST_MINIMAX_DEFAULT_BASE_URL}/v1/image_generation`);
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer minimax-test-key',
        'content-type': 'application/json',
      });
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        model: 'image-01-custom',
        prompt: 'A watercolor shiba inu under cherry blossoms',
        aspect_ratio: '16:9',
        response_format: 'base64',
        n: 1,
      });
      expect(body).not.toHaveProperty('subject_reference');
      return new Response(JSON.stringify({
        base_resp: { status_code: 0, status_msg: 'success' },
        data: { image_base64: [PNG_BASE64] },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'minimax-image-01',
      prompt: 'A watercolor shiba inu under cherry blossoms',
      aspect: '16:9',
      output: 'minimax.png',
    });

    expect(result.name).toBe('minimax.png');
    expect(result.providerId).toBe('minimax');
    expect(result.providerNote).toContain('minimax/image-01-custom');
    expect(result.providerNote).toContain('16:9');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'minimax.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('forwards --image as subject_reference[0].image_file for I2I', async () => {
    await writeConfig({
      providers: { minimax: {} },
    });

    // Write a real reference PNG inside the project so resolveProjectImage
    // can stat it and turn it into a data URL the renderer can splice in.
    const projectDir = path.join(projectsRoot, 'project-1');
    await mkdir(projectDir, { recursive: true });
    const refPath = path.join(projectDir, 'ref.png');
    await writeFile(refPath, Buffer.from(PNG_BASE64, 'base64'));

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      // Confirm the renderer hits the image-specific host even when no
      // custom baseUrl is supplied.
      expect(String(input)).toBe(`${TEST_MINIMAX_DEFAULT_BASE_URL}/v1/image_generation`);
      const body = JSON.parse(String(init?.body));
      // Subject reference must be present and carry the data URL of the
      // --image file (we don't assert exact bytes because the data URL is
      // derived from the on-disk PNG; the prefix is the contract).
      expect(body.subject_reference).toEqual([{
        type: 'character',
        image_file: expect.stringMatching(/^data:image\/png;base64,/),
      }]);
      // Wire model falls through to MINIMAX_IMAGE_MODEL_MAP when no override.
      expect(body.model).toBe('image-01');
      // defaultAspectFor('image') returns '1:1', which IS in the MiniMax
      // allowlist, so the renderer forwards it.
      expect(body.aspect_ratio).toBe('1:1');
      return new Response(JSON.stringify({
        base_resp: { status_code: 0, status_msg: 'success' },
        data: { image_base64: [PNG_BASE64] },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'minimax-image-01',
      prompt: 'restyle as ukiyo-e',
      image: './ref.png',
      output: 'minimax-i2i.png',
    });

    expect(result.name).toBe('minimax-i2i.png');
    expect(result.providerId).toBe('minimax');
    // providerNote must NOT echo the data URL — no PII leak in metadata.
    expect(result.providerNote).not.toContain('data:image');
    expect(result.providerNote).toContain('minimax/image-01');

    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'minimax-i2i.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('surfaces base_resp.status_code failures with status_msg as the error', async () => {
    await writeConfig({ providers: { minimax: {} } });

    // MiniMax wraps every response in base_resp; an HTTP 200 can still be a
    // logical failure (e.g. status_code 1008 = insufficient balance). The
    // renderer must surface this as a thrown Error rather than silently
    // returning empty bytes.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      base_resp: {
        status_code: 1008,
        status_msg: 'Insufficient account balance',
      },
      // No data.image_base64 — the renderer should reject on base_resp before
      // ever reaching the decode path.
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'minimax-image-01',
      prompt: 'A watercolor shiba inu',
      output: 'minimax.png',
    })).rejects.toThrow(/minimax image api error 1008: Insufficient account balance/);

    // Renderer must NOT have written any output file when the upstream
    // rejected the request, even though HTTP 200 was returned.
    const outPath = path.join(projectsRoot, 'project-1', 'minimax.png');
    await expect(readFile(outPath)).rejects.toThrow();
  });

  it('surfaces upstream HTTP errors with status code and body excerpt', async () => {
    await writeConfig({ providers: { minimax: {} } });

    // 401 with a non-JSON body — the renderer must report both the HTTP
    // status and the body excerpt in the thrown Error.
    const fetchMock = vi.fn(async () => new Response('unauthorized', {
      status: 401,
      headers: { 'content-type': 'text/plain' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'minimax-image-01',
      prompt: 'A watercolor shiba inu',
      output: 'minimax.png',
    })).rejects.toThrow(/minimax image 401: unauthorized/);
  });

  it('uses the image-specific default base URL and wire model when no config is provided', async () => {
    // No writeConfig() call — the provider slot exists but has no stored
    // config. resolveProviderConfig still returns apiKey from
    // OD_MINIMAX_API_KEY, but baseUrl and model come from the renderer's
    // image-specific defaults.
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      // Default image base URL is the api.minimax.io host, distinct from
      // the legacy TTS api.minimaxi.chat. Verifies the renderer does not
      // inherit the TTS constant.
      expect(String(input)).toBe(`${TEST_MINIMAX_DEFAULT_BASE_URL}/v1/image_generation`);
      const body = JSON.parse(String(init?.body));
      // Default wire model is MiniMax image-01, resolved via the catalog
      // map from our vendor-prefixed catalog id.
      expect(body.model).toBe('image-01');
      expect(body).not.toHaveProperty('subject_reference');
      return new Response(JSON.stringify({
        base_resp: { status_code: 0, status_msg: 'success' },
        data: { image_base64: [PNG_BASE64] },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'minimax-image-01',
      prompt: 'A watercolor shiba inu',
      output: 'minimax.png',
    });

    expect(result.providerId).toBe('minimax');
    expect(result.providerNote).toContain('minimax/image-01');
  });

  it('ignores credentials.baseUrl for image even when it points at the legacy TTS host', async () => {
    // Regression test for the user's reported 404. The 'minimax' provider
    // slot is shared with TTS, whose stored baseUrl is the legacy
    // api.minimaxi.chat/v1 host. Naively appending '/v1/image_generation'
    // produces https://api.minimaxi.chat/v1/v1/image_generation — a 404
    // against the wrong host. The image renderer must ignore
    // credentials.baseUrl entirely and pin to its own host.
    await writeConfig({
      providers: { minimax: { baseUrl: TEST_MINIMAX_TTS_BASE_URL } },
    });

    const fetchMock = vi.fn(async (input: unknown) => {
      // Must hit the image-specific host, NOT the doubled TTS URL.
      expect(String(input)).toBe(`${TEST_MINIMAX_DEFAULT_BASE_URL}/v1/image_generation`);
      expect(String(input)).not.toContain('/v1/v1/');
      return new Response(JSON.stringify({
        base_resp: { status_code: 0, status_msg: 'success' },
        data: { image_base64: [PNG_BASE64] },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'minimax-image-01',
      prompt: 'A watercolor shiba inu',
      output: 'minimax.png',
    })).resolves.toMatchObject({ providerId: 'minimax' });
  });

  it('honors OD_MINIMAX_IMAGE_BASE_URL as an operator override', async () => {
    // Operators running a proxy or staging gateway can pin the image
    // endpoint via OD_MINIMAX_IMAGE_BASE_URL. Stored credentials.baseUrl
    // is ignored either way; only the env var wins over the default.
    process.env.OD_MINIMAX_IMAGE_BASE_URL = 'https://minimax-gateway.example.test';
    await writeConfig({
      providers: { minimax: { baseUrl: TEST_MINIMAX_TTS_BASE_URL } },
    });

    const fetchMock = vi.fn(async (input: unknown) => {
      expect(String(input)).toBe('https://minimax-gateway.example.test/v1/image_generation');
      // Trailing slash on the env var must NOT produce a doubled slash.
      expect(String(input)).not.toContain('//v1/');
      return new Response(JSON.stringify({
        base_resp: { status_code: 0, status_msg: 'success' },
        data: { image_base64: [PNG_BASE64] },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'minimax-image-01',
      prompt: 'A watercolor shiba inu',
      output: 'minimax.png',
    })).resolves.toMatchObject({ providerId: 'minimax' });
  });

  it('throws a clear error when no MiniMax API key is configured', async () => {
    // The renderer must reject the request before touching the network
    // when credentials.apiKey is missing — otherwise the user gets a
    // confusing 401 from MiniMax instead of the actionable "configure
    // it in Settings" message that matches every other renderer.
    delete process.env.OD_MINIMAX_API_KEY;
    await writeConfig({ providers: { minimax: {} } });

    // No fetch mock needed: the renderer must short-circuit before
    // dispatching. If it doesn't, vi.fn would surface as unhandled
    // and the test would still fail — both sides of the contract are
    // anchored.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'minimax-image-01',
      prompt: 'A watercolor shiba inu',
      output: 'minimax.png',
    })).rejects.toThrow(/no MiniMax API key/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes an aliased wireModel through unchanged when not in the catalog map', async () => {
    // The map MINIMAX_IMAGE_MODEL_MAP is keyed off the catalog id, but
    // ctx.wireModel may have been rewritten by OD_MEDIA_MODEL_ALIASES.
    // When the alias is *not* in the map, the renderer must use the
    // aliased name as-is rather than silently substituting the catalog
    // map value or the bare catalog id. Anchors the alias passthrough
    // contract so a future refactor that re-keys the map off ctx.model
    // would fail this test instead of silently breaking aliases.
    process.env.OD_MEDIA_MODEL_ALIASES = JSON.stringify({
      'minimax-image-01': 'image-01-pro',
    });
    await writeConfig({ providers: { minimax: {} } });

    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('image-01-pro');
      return new Response(JSON.stringify({
        base_resp: { status_code: 0, status_msg: 'success' },
        data: { image_base64: [PNG_BASE64] },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'minimax-image-01',
      prompt: 'A watercolor shiba inu',
      output: 'minimax.png',
    });

    expect(result.providerId).toBe('minimax');
    // providerNote must surface the aliased wire name, not the catalog
    // id — the FileViewer toolbar tells the truth about what was sent.
    expect(result.providerNote).toContain('minimax/image-01-pro');
  });

  it('forwards aspects outside MEDIA_ASPECTS but inside MiniMax allowlist (21:9)', async () => {
    // MEDIA_ASPECTS (apps/web/src/media/models.ts) is currently
    // ['1:1','16:9','9:16','4:3','3:4']. The agent can still pass an
    // arbitrary aspect string through the media API; the renderer must
    // honor any value in MiniMax's wider allowlist (1:1, 16:9, 4:3, 3:2,
    // 2:3, 3:4, 9:16, 21:9) rather than silently dropping it back to
    // MiniMax's 1:1 default. Anchors the "21:9 reaches the wire"
    // contract for any future UI that exposes wider aspect ratios.
    await writeConfig({ providers: { minimax: {} } });

    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.aspect_ratio).toBe('21:9');
      return new Response(JSON.stringify({
        base_resp: { status_code: 0, status_msg: 'success' },
        data: { image_base64: [PNG_BASE64] },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'minimax-image-01',
      prompt: 'A watercolor shiba inu',
      aspect: '21:9',
      output: 'minimax.png',
    })).resolves.toMatchObject({ providerId: 'minimax' });
  });
});