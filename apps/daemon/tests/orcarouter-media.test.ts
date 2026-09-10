// OrcaRouter media generation through the daemon's OpenAI-standard media path.
//
// OrcaRouter exposes image and video on the same `/v1/images/generations` and
// `/v1/videos/generations` contracts the OpenAI/ImageRouter providers already
// speak, so this asserts the two things OrcaRouter adds on top: the catalogue
// prefix is stripped before the wire call, and the request carries the user's
// credential to the inference origin.

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media/index.js';

// 1x1 PNG — enough for the renderer to sniff a real extension.
const FAKE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const FAKE_MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
]);

describe('orcarouter media generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalEnvKeys = {
    ORCA_API_KEY: process.env.ORCA_API_KEY,
    OD_ORCAROUTER_API_KEY: process.env.OD_ORCAROUTER_API_KEY,
    ORCAROUTER_API_KEY: process.env.ORCAROUTER_API_KEY,
  };
  const clearCredentialEnv = () => {
    for (const name of Object.keys(originalEnvKeys)) delete process.env[name];
  };

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'orca-media-'));
    projectRoot = path.join(root, 'project');
    projectsRoot = path.join(root, 'projects');
    process.env.OD_MEDIA_CONFIG_DIR = path.join(root, 'config');
    // Clear every credential name first: the host environment also exports one,
    // and a leftover would turn a unit test into a live paid request.
    clearCredentialEnv();
    process.env.ORCA_API_KEY = 'sk-orca-fake-media-key';
    const { mkdir } = await import('node:fs/promises');
    await mkdir(projectRoot, { recursive: true });
    await mkdir(projectsRoot, { recursive: true });
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
    if (originalMediaConfigDir === undefined) delete process.env.OD_MEDIA_CONFIG_DIR;
    else process.env.OD_MEDIA_CONFIG_DIR = originalMediaConfigDir;
    clearCredentialEnv();
    for (const [name, value] of Object.entries(originalEnvKeys)) {
      if (value !== undefined) process.env[name] = value;
    }
    await rm(root, { recursive: true, force: true });
  });

  it('strips the catalogue prefix and posts the gateway its own model id', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [{ b64_json: FAKE_PNG.toString('base64') }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'p1',
      surface: 'image',
      model: 'orcarouter/gpt-image-2',
      prompt: 'a lighthouse at dusk',
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    // Inference origin, images path.
    expect(parsed.hostname).toBe('api.orcarouter.ai');
    expect(parsed.pathname).toContain('/images/generations');
    expect((init.headers as Record<string, string>).authorization)
      .toBe('Bearer sk-orca-fake-media-key');

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    // The catalogue prefix is a local disambiguator, not part of the wire id.
    expect(body.model).toBe('gpt-image-2');
    expect(body.prompt).toBe('a lighthouse at dusk');

    expect(result.providerNote).toContain('orcarouter/gpt-image-2');
    expect(result.providerNote).not.toContain('/images/generations');
  });

  it('serves video through the OpenAI-standard videos path', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [{ b64_json: FAKE_MP4.toString('base64') }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'p1',
      surface: 'video',
      model: 'orcarouter/kling/kling-v3',
      prompt: 'a slow dolly over a city',
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.hostname).toBe('api.orcarouter.ai');
    expect(parsed.pathname).toContain('/videos/generations');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    // Only the leading catalogue prefix is stripped — the vendor namespace stays.
    expect(body.model).toBe('kling/kling-v3');
    expect(result.mime).toBe('video/mp4');
  });

  it('carries a staged reference image to the i2v model instead of sending a text-only job', async () => {
    // Kling v3 advertises i2v, so a supplied image must reach the wire. Before
    // this was wired, the request body held only the prompt and a text-to-video
    // job was billed for an image-to-video request.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [{ b64_json: FAKE_MP4.toString('base64') }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const reference = `data:image/png;base64,${FAKE_PNG.toString('base64')}`;
    // `--image` takes a path relative to the project directory generateMedia
    // resolves (projectsRoot/<projectId>); it is read into a data URL there.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.join(projectsRoot, 'p1'), { recursive: true });
    await writeFile(path.join(projectsRoot, 'p1', 'ref.png'), FAKE_PNG);
    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'p1',
      surface: 'video',
      model: 'orcarouter/kling/kling-v3',
      prompt: 'the camera pushes in',
      image: 'ref.png',
    } as Parameters<typeof generateMedia>[0]);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.input_reference).toBe(reference);
    expect(result.providerNote).toContain('i2v');
  });

  it('fails with an actionable message when no credential is configured', async () => {
    clearCredentialEnv();
    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'p1',
      surface: 'image',
      model: 'orcarouter/gpt-image-2',
      prompt: 'x',
    })).rejects.toThrow(/OrcaRouter credential/i);
  });

  it('uses the credential the connect flow saved, with no env key and no media key', async () => {
    // The blocking gap in one test: the UI can report Connected and load models
    // from a PKCE login, yet neither a pasted key nor the PKCE account populated
    // the provider map `resolveProviderConfig` reads. Generation then failed
    // with "no credential". The daemon-held store is now part of that chain.
    clearCredentialEnv();
    process.env.OD_DATA_DIR = path.join(root, 'data');
    const { acquirePkceCredential, setOrcaRouterCredential } =
      await import('../src/integrations/orcarouter-credentials.js');
    await setOrcaRouterCredential(
      process.env.OD_DATA_DIR,
      acquirePkceCredential({
        exchange: { key: 'sk-orca-from-the-connect-flow', user_id: 'acct', scope: 'api' },
      }),
    );

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [{ b64_json: FAKE_PNG.toString('base64') }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'p1',
        surface: 'image',
        model: 'orcarouter/gpt-image-2',
        prompt: 'x',
      });
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect((init.headers as Record<string, string>).authorization)
        .toBe('Bearer sk-orca-from-the-connect-flow');
    } finally {
      delete process.env.OD_DATA_DIR;
    }
  });

  it('rejects rather than replaying a credential the relay already revoked', async () => {
    clearCredentialEnv();
    process.env.OD_DATA_DIR = path.join(root, 'data-revoked');
    const {
      acquirePkceCredential,
      markOrcaRouterCredentialNeedsReauth,
      setOrcaRouterCredential,
    } = await import('../src/integrations/orcarouter-credentials.js');
    const credential = acquirePkceCredential({
      exchange: { key: 'sk-orca-revoked', user_id: 'acct', scope: 'api' },
    });
    await setOrcaRouterCredential(process.env.OD_DATA_DIR, credential);
    await markOrcaRouterCredentialNeedsReauth(process.env.OD_DATA_DIR, {
      accountId: 'acct',
      generation: credential.generation,
    });

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await expect(generateMedia({
        projectRoot,
        projectsRoot,
        projectId: 'p1',
        surface: 'image',
        model: 'orcarouter/gpt-image-2',
        prompt: 'x',
      })).rejects.toThrow(/OrcaRouter credential/i);
      // Nothing was sent with the terminal credential.
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      delete process.env.OD_DATA_DIR;
    }
  });

  it('writes the generated bytes to disk', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: [{ b64_json: FAKE_PNG.toString('base64') }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'p1',
      surface: 'image',
      model: 'orcarouter/gpt-image-2',
      prompt: 'x',
    });
    const written = await readFile(path.join(projectsRoot, 'p1', result.name));
    expect(written.subarray(0, 8)).toEqual(FAKE_PNG.subarray(0, 8));
  });
});
