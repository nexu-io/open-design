import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../../src/media/index.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';
const VIDEO_BASE64 = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]).toString('base64');
const OPENAI_ENV_KEYS = [
  'OD_OPENAI_API_KEY',
  'OPENAI_API_KEY',
  'AZURE_API_KEY',
  'AZURE_OPENAI_API_KEY',
];

describe('OpenAI-compatible media providers', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const realFetch = globalThis.fetch;
  const originalImageRouterKey = process.env.OD_IMAGEROUTER_API_KEY;
  const originalCustomImageKey = process.env.OD_CUSTOM_IMAGE_API_KEY;
  const originalCodexBin = process.env.CODEX_BIN;
  const originalCodexHome = process.env.CODEX_HOME;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;
  const originalEnvAliases = process.env.OD_MEDIA_MODEL_ALIASES;
  const originalAllowStubs = process.env.OD_MEDIA_ALLOW_STUBS;
  const originalOpenAIEnv = Object.fromEntries(
    OPENAI_ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-openai-compatible-media-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(projectsRoot, { recursive: true });
    delete process.env.OD_IMAGEROUTER_API_KEY;
    delete process.env.OD_CUSTOM_IMAGE_API_KEY;
    delete process.env.CODEX_BIN;
    delete process.env.CODEX_HOME;
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
    delete process.env.OD_MEDIA_MODEL_ALIASES;
    delete process.env.OD_MEDIA_ALLOW_STUBS;
    for (const key of OPENAI_ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
    if (originalImageRouterKey == null) {
      delete process.env.OD_IMAGEROUTER_API_KEY;
    } else {
      process.env.OD_IMAGEROUTER_API_KEY = originalImageRouterKey;
    }
    if (originalCustomImageKey == null) {
      delete process.env.OD_CUSTOM_IMAGE_API_KEY;
    } else {
      process.env.OD_CUSTOM_IMAGE_API_KEY = originalCustomImageKey;
    }
    if (originalCodexBin == null) {
      delete process.env.CODEX_BIN;
    } else {
      process.env.CODEX_BIN = originalCodexBin;
    }
    if (originalCodexHome == null) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
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
    if (originalEnvAliases == null) {
      delete process.env.OD_MEDIA_MODEL_ALIASES;
    } else {
      process.env.OD_MEDIA_MODEL_ALIASES = originalEnvAliases;
    }
    if (originalAllowStubs == null) {
      delete process.env.OD_MEDIA_ALLOW_STUBS;
    } else {
      process.env.OD_MEDIA_ALLOW_STUBS = originalAllowStubs;
    }
    for (const key of OPENAI_ENV_KEYS) {
      if (originalOpenAIEnv[key] == null) {
        delete process.env[key];
      } else {
        process.env[key] = originalOpenAIEnv[key];
      }
    }
    await rm(root, { recursive: true, force: true });
  });

  async function writeConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  async function writeCodexAuth(codexHome: string, data: unknown) {
    await mkdir(codexHome, { recursive: true });
    await writeFile(path.join(codexHome, 'auth.json'), JSON.stringify(data), 'utf8');
  }

  async function installFakeCodex(
    codexHome: string,
    threadId: string,
    options: {
      expectedConfigIncludes?: string;
      expectedConfigExcludes?: string;
      expectedArgsIncludes?: string;
      expectedArgsExcludes?: string;
    } = {},
  ) {
    const codexBin = path.join(root, `${threadId}.mjs`);
    await writeFile(codexBin, `#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const pngBase64 = '${PNG_BASE64}';
const expectedConfigIncludes = ${JSON.stringify(options.expectedConfigIncludes ?? '')};
const expectedConfigExcludes = ${JSON.stringify(options.expectedConfigExcludes ?? '')};
const expectedArgsIncludes = ${JSON.stringify(options.expectedArgsIncludes ?? '')};
const expectedArgsExcludes = ${JSON.stringify(options.expectedArgsExcludes ?? '')};
const args = process.argv.slice(2);
const addDirIndex = args.indexOf('--add-dir');
const generatedRoot = addDirIndex >= 0 ? args[addDirIndex + 1] : '';
let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { stdin += chunk; });
process.stdin.on('end', () => {
  if (expectedConfigIncludes || expectedConfigExcludes) {
    const config = readFileSync(path.join(process.env.CODEX_HOME || '', 'config.toml'), 'utf8');
    if (expectedConfigIncludes && !config.includes(expectedConfigIncludes)) {
      process.stderr.write('expected normalized config to include ' + expectedConfigIncludes);
      process.exit(8);
    }
    if (expectedConfigExcludes && config.includes(expectedConfigExcludes)) {
      process.stderr.write('expected normalized config to exclude ' + expectedConfigExcludes);
      process.exit(9);
    }
  }
  if (expectedArgsIncludes && !args.includes(expectedArgsIncludes)) {
    process.stderr.write('expected args to include ' + expectedArgsIncludes);
    process.exit(10);
  }
  if (expectedArgsExcludes && args.some((arg) => arg.includes(expectedArgsExcludes))) {
    process.stderr.write('expected args to exclude ' + expectedArgsExcludes);
    process.exit(11);
  }
  if (!stdin.includes('$imagegen') || !generatedRoot) process.exit(7);
  const outDir = path.join(generatedRoot, '${threadId}');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'ig_0001.png'), Buffer.from(pngBase64, 'base64'));
  process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: '${threadId}' }) + '\\n');
});
`, 'utf8');
    await chmod(codexBin, 0o755);
    process.env.CODEX_BIN = codexBin;
    process.env.CODEX_HOME = codexHome;
  }

  it('renders custom /v1/images/generations providers with configured base URL and model', async () => {
    await writeConfig({
      providers: {
        'custom-image': {
          baseUrl: 'https://images.example.test/v1',
          model: 'acme-image-model',
        },
      },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://images.example.test/v1/images/generations');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'content-type': 'application/json',
      });
      expect(init?.headers).not.toHaveProperty('authorization');
      expect(JSON.parse(String(init?.body))).toEqual({
        prompt: 'A product render on white seamless paper',
        model: 'acme-image-model',
        n: 1,
        size: '1024x1024',
      });
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_BASE64 }],
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
      model: 'custom-image',
      prompt: 'A product render on white seamless paper',
      output: 'custom.png',
    });

    expect(result.providerId).toBe('custom-image');
    expect(result.providerNote).toContain('custom-image/acme-image-model');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'custom.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('forwards requestInit.dispatcher through custom-image submit and asset fetches', async () => {
    await writeConfig({
      providers: {
        'custom-image': {
          baseUrl: 'https://images.example.test/v1',
          model: 'acme-image-model',
        },
      },
    });

    const dispatcher = {} as NonNullable<RequestInit['dispatcher']>;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      if (String(input) === 'https://images.example.test/v1/images/generations') {
        expect(init?.dispatcher).toBe(dispatcher);
        return new Response(JSON.stringify({
          data: [{ url: 'https://cdn.example.test/generated.png' }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      expect(String(input)).toBe('https://cdn.example.test/generated.png');
      expect(init?.dispatcher).toBe(dispatcher);
      return new Response(Buffer.from(PNG_BASE64, 'base64'));
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'custom-image',
      prompt: 'A product render on white seamless paper',
      output: 'custom-dispatcher.png',
      requestInit: { dispatcher },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('routes matching OpenAI image catalog ids through the configured custom provider', async () => {
    await writeConfig({
      providers: {
        'custom-image': {
          apiKey: 'proxy-test-key',
          baseUrl: 'https://proxy.example.test/v1/images/generations',
          model: 'gpt-image-2',
        },
      },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://proxy.example.test/v1/images/generations');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer proxy-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        prompt: 'A clean app icon with glass material',
        model: 'gpt-image-2',
        n: 1,
        size: '1024x1024',
      });
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_BASE64 }],
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
      model: 'gpt-image-2',
      prompt: 'A clean app icon with glass material',
      output: 'proxy.png',
    });

    expect(result.providerId).toBe('custom-image');
    expect(result.providerNote).toContain('custom-image/gpt-image-2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rewrites custom-image text-only requests back to /v1/images/generations when configured with an edits URL', async () => {
    await writeConfig({
      providers: {
        'custom-image': {
          apiKey: 'proxy-test-key',
          baseUrl: 'https://proxy.example.test/v1/images/edits',
          model: 'acme-image-model',
        },
      },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://proxy.example.test/v1/images/generations');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer proxy-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        prompt: 'A matte product shot on a neutral backdrop',
        model: 'acme-image-model',
        n: 1,
        size: '1024x1024',
      });
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_BASE64 }],
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
      model: 'custom-image',
      prompt: 'A matte product shot on a neutral backdrop',
      output: 'custom-from-edits-base.png',
    });

    expect(result.providerId).toBe('custom-image');
    expect(result.providerNote).toContain('custom-image/acme-image-model');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('routes custom-image reference-image requests through /v1/images/edits', async () => {
    await writeConfig({
      providers: {
        'custom-image': {
          apiKey: 'proxy-test-key',
          baseUrl: 'https://proxy.example.test/v1',
          model: 'acme-image-edit-model',
        },
      },
    });
    const projectDir = path.join(projectsRoot, 'project-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      path.join(projectDir, 'reference.png'),
      Buffer.from(PNG_BASE64, 'base64'),
    );

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://proxy.example.test/v1/images/edits');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer proxy-test-key',
        'content-type': 'application/json',
      });
      const body = JSON.parse(String(init?.body));
      expect(body.prompt).toBe('Turn this reference into a blueprint-style UI illustration');
      expect(body.model).toBe('acme-image-edit-model');
      expect(body.n).toBe(1);
      expect(body.size).toBe('1024x1024');
      expect(body.response_format).toBe('b64_json');
      expect(body.images).toHaveLength(1);
      expect(body.images[0]?.image_url).toMatch(/^data:image\/png;base64,/);
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_BASE64 }],
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
      model: 'custom-image',
      prompt: 'Turn this reference into a blueprint-style UI illustration',
      image: 'reference.png',
      output: 'edited.png',
    });

    expect(result.providerId).toBe('custom-image');
    expect(result.providerNote).toContain('custom-image/acme-image-edit-model');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const bytes = await readFile(path.join(projectDir, 'edited.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('renders ImageRouter images through the OpenAI-compatible JSON endpoint', async () => {
    process.env.OD_IMAGEROUTER_API_KEY = 'ir-test-key';

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.imagerouter.io/v1/openai/images/generations');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer ir-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        prompt: 'A cinematic vertical poster',
        model: 'openai/gpt-image-2',
        quality: 'auto',
        size: '576x1024',
        response_format: 'b64_json',
        output_format: 'png',
      });
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_BASE64 }],
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
      model: 'openai/gpt-image-2',
      prompt: 'A cinematic vertical poster',
      aspect: '9:16',
      output: 'imagerouter.png',
    });

    expect(result.providerId).toBe('imagerouter');
    expect(result.providerNote).toContain('imagerouter/openai/gpt-image-2');
  });

  it('renders ImageRouter videos through the OpenAI-compatible JSON endpoint', async () => {
    process.env.OD_IMAGEROUTER_API_KEY = 'ir-test-key';

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.imagerouter.io/v1/openai/videos/generations');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer ir-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        prompt: 'A short cinematic camera push through a neon market',
        model: 'xAI/grok-imagine-video',
        size: '1024x576',
        seconds: 8,
        response_format: 'b64_json',
      });
      return new Response(JSON.stringify({
        data: [{ b64_json: VIDEO_BASE64 }],
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
      surface: 'video',
      model: 'xAI/grok-imagine-video',
      prompt: 'A short cinematic camera push through a neon market',
      aspect: '16:9',
      length: 8,
      output: 'imagerouter.mp4',
    });

    expect(result.providerId).toBe('imagerouter');
    expect(result.name).toBe('imagerouter.mp4');
    expect(result.providerNote).toContain('imagerouter/xAI/grok-imagine-video');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'imagerouter.mp4'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('routes default gpt-image-2 through Codex when a subscription login is available', async () => {
    const generatedHome = path.join(root, 'subscription-codex-home');
    await writeCodexAuth(generatedHome, {
      auth_mode: 'chatgpt',
      OPENAI_API_KEY: null,
    });
    await installFakeCodex(generatedHome, 'subscription-codex-thread');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'A compact green app icon with a folded page motif',
      output: 'subscription-default.png',
    });

    expect(result.providerId).toBe('codex');
    expect(result.providerNote).toContain('codex/gpt-image-2');
    expect(fetchMock).not.toHaveBeenCalled();
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'subscription-default.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('prefers the Codex subscription path for gpt-image-2 even when an OpenAI key is configured', async () => {
    const generatedHome = path.join(root, 'subscription-before-api-codex-home');
    await writeCodexAuth(generatedHome, {
      tokens: { access_token: 'codex-oauth-token' },
    });
    await installFakeCodex(generatedHome, 'subscription-before-api-thread');
    process.env.OPENAI_API_KEY = 'sk-openai-test-key';

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'A compact green app icon with a folded page motif',
      output: 'subscription-before-api.png',
    });

    expect(result.providerId).toBe('codex');
    expect(result.providerNote).toContain('codex/gpt-image-2');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('removes stale Codex service_tier before subscription image generation', async () => {
    const generatedHome = path.join(root, 'stale-tier-codex-home');
    await writeCodexAuth(generatedHome, {
      auth_mode: 'chatgpt',
      OPENAI_API_KEY: null,
    });
    await writeFile(
      path.join(generatedHome, 'config.toml'),
      `[model]\nservice_tier = "default"\nmodel = "gpt-5.5"\n`,
      'utf8',
    );
    await installFakeCodex(generatedHome, 'stale-tier-codex-thread', {
      // The invalid service_tier line is removed entirely (Codex falls back to
      // its built-in default tier), so the key is gone and the rest remains.
      expectedConfigIncludes: 'model = "gpt-5.5"',
      expectedConfigExcludes: 'service_tier',
      expectedArgsExcludes: 'default_permissions',
    });

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'A compact green app icon with a folded page motif',
      output: 'subscription-stale-tier.png',
    });

    expect(result.providerId).toBe('codex');
    const after = await readFile(path.join(generatedHome, 'config.toml'), 'utf8');
    expect(after).not.toContain('service_tier');
    expect(after).not.toContain('"default"');
    expect(after).toContain('model = "gpt-5.5"');
  });

  it('does not reroute OpenAI image models without a Codex twin', async () => {
    const generatedHome = path.join(root, 'dalle-subscription-codex-home');
    await writeCodexAuth(generatedHome, {
      auth_mode: 'chatgpt',
    });
    process.env.CODEX_HOME = generatedHome;

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'dall-e-3',
      prompt: 'A product render on white seamless paper',
      output: 'dalle.png',
    })).rejects.toThrow(/codex-gpt-image-2/);
  });

  it('keeps aliased gpt-image-2 on the explicit OpenAI API path', async () => {
    const generatedHome = path.join(root, 'aliased-subscription-codex-home');
    await writeCodexAuth(generatedHome, {
      auth_mode: 'chatgpt',
    });
    process.env.CODEX_HOME = generatedHome;
    process.env.OPENAI_API_KEY = 'sk-openai-test-key';
    process.env.OD_MEDIA_MODEL_ALIASES = JSON.stringify({
      'gpt-image-2': 'custom-gpt-image-2-deployment',
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.openai.com/v1/images/generations');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer sk-openai-test-key',
        'content-type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        prompt: 'A clean app icon with glass material',
        model: 'custom-gpt-image-2-deployment',
      });
      return new Response(JSON.stringify({
        data: [{ b64_json: PNG_BASE64 }],
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
      model: 'gpt-image-2',
      prompt: 'A clean app icon with glass material',
      output: 'aliased-openai.png',
    });

    expect(result.providerId).toBe('openai');
    expect(result.providerNote).toContain('openai/custom-gpt-image-2-deployment');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders Codex subscription images through the local Codex CLI', async () => {
    const generatedHome = path.join(root, 'codex-home');
    const codexBin = path.join(root, 'fake-codex.mjs');
    await writeFile(codexBin, `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const pngBase64 = '${PNG_BASE64}';
const args = process.argv.slice(2);
const addDirIndex = args.indexOf('--add-dir');
const generatedRoot = addDirIndex >= 0 ? args[addDirIndex + 1] : '';
let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { stdin += chunk; });
process.stdin.on('end', () => {
  if (!stdin.includes('$imagegen') || !generatedRoot) process.exit(7);
  const threadId = 'codex-thread-test';
  const outDir = path.join(generatedRoot, threadId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'ig_0001.png'), Buffer.from(pngBase64, 'base64'));
  process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: threadId }) + '\\n');
  process.stdout.write(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 4, output_tokens: 2 } }) + '\\n');
});
`, 'utf8');
    await chmod(codexBin, 0o755);
    process.env.CODEX_BIN = codexBin;
    process.env.CODEX_HOME = generatedHome;

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'codex-gpt-image-2',
      prompt: 'A compact green app icon with a folded page motif',
      output: 'codex.png',
    });

    expect(result.providerId).toBe('codex');
    expect(result.providerNote).toContain('codex/gpt-image-2');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'codex.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('reports Codex preview-only imagegen output without leaking ENOENT', async () => {
    const generatedHome = path.join(root, 'preview-only-codex-home');
    const codexBin = path.join(root, 'preview-only-codex.mjs');
    await writeFile(codexBin, `#!/usr/bin/env node
let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { stdin += chunk; });
process.stdin.on('end', () => {
  if (!stdin.includes('$imagegen')) process.exit(7);
  process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: 'preview-only-thread' }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'item.completed',
    item: {
      type: 'agent_message',
      text: 'This is preview-only, so I generated it without saving a file to the project.'
    }
  }) + '\\n');
  process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n');
});
`, 'utf8');
    await chmod(codexBin, 0o755);
    process.env.CODEX_BIN = codexBin;
    process.env.CODEX_HOME = generatedHome;

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'codex-gpt-image-2',
      prompt: 'A compact green app icon with a folded page motif',
      output: 'codex-preview-only.png',
    })).rejects.toThrow(/Codex imagegen completed in preview-only mode/i);
  });

  it('uses app-config Codex CLI env overrides for subscription image generation', async () => {
    const dataDir = path.join(root, 'app-data');
    const generatedHome = path.join(root, 'configured-codex-home');
    const codexBin = path.join(root, 'configured-codex.mjs');
    const wrongCodexBin = path.join(root, 'wrong-codex.mjs');
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({
      agentCliEnv: {
        codex: {
          CODEX_BIN: codexBin,
          CODEX_HOME: generatedHome,
        },
      },
    }), 'utf8');
    await writeFile(wrongCodexBin, `#!/usr/bin/env node
process.stderr.write('wrong codex bin used');
process.exit(17);
`, 'utf8');
    await chmod(wrongCodexBin, 0o755);
    await writeFile(codexBin, `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const pngBase64 = '${PNG_BASE64}';
const expectedHome = ${JSON.stringify(generatedHome)};
const args = process.argv.slice(2);
const addDirIndex = args.indexOf('--add-dir');
const generatedRoot = addDirIndex >= 0 ? args[addDirIndex + 1] : '';
if (process.env.CODEX_HOME !== expectedHome) {
  process.stderr.write('CODEX_HOME override was not forwarded');
  process.exit(18);
}
if (!generatedRoot.startsWith(path.join(expectedHome, 'generated_images'))) {
  process.stderr.write('generated root did not use configured CODEX_HOME');
  process.exit(19);
}
let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { stdin += chunk; });
process.stdin.on('end', () => {
  if (!stdin.includes('$imagegen') || !generatedRoot) process.exit(20);
  const threadId = 'configured-codex-thread';
  const outDir = path.join(generatedRoot, threadId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'ig_0001.png'), Buffer.from(pngBase64, 'base64'));
  process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: threadId }) + '\\n');
});
`, 'utf8');
    await chmod(codexBin, 0o755);
    process.env.OD_DATA_DIR = dataDir;
    process.env.CODEX_BIN = wrongCodexBin;
    process.env.CODEX_HOME = path.join(root, 'wrong-codex-home');

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'codex-gpt-image-2',
      prompt: 'A compact green app icon with a folded page motif',
      output: 'codex-configured.png',
    });

    expect(result.providerId).toBe('codex');
    expect(result.providerNote).toContain('codex/gpt-image-2');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'codex-configured.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('uses default app-config Codex CLI env overrides when OD_DATA_DIR is absent', async () => {
    const dataDir = path.join(projectRoot, '.od');
    const generatedHome = path.join(root, 'default-codex-home');
    const codexBin = path.join(root, 'default-codex.mjs');
    const wrongCodexBin = path.join(root, 'wrong-default-codex.mjs');
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({
      agentCliEnv: {
        codex: {
          CODEX_BIN: codexBin,
          CODEX_HOME: generatedHome,
        },
      },
    }), 'utf8');
    await writeFile(wrongCodexBin, `#!/usr/bin/env node
process.stderr.write('wrong codex bin used without OD_DATA_DIR');
process.exit(24);
`, 'utf8');
    await chmod(wrongCodexBin, 0o755);
    await writeFile(codexBin, `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const pngBase64 = '${PNG_BASE64}';
const expectedHome = ${JSON.stringify(generatedHome)};
const args = process.argv.slice(2);
const addDirIndex = args.indexOf('--add-dir');
const generatedRoot = addDirIndex >= 0 ? args[addDirIndex + 1] : '';
if (process.env.CODEX_HOME !== expectedHome) {
  process.stderr.write('default CODEX_HOME override was not forwarded');
  process.exit(25);
}
let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { stdin += chunk; });
process.stdin.on('end', () => {
  if (!stdin.includes('$imagegen') || !generatedRoot) process.exit(26);
  const threadId = 'default-codex-thread';
  const outDir = path.join(generatedRoot, threadId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'ig_0001.png'), Buffer.from(pngBase64, 'base64'));
  process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: threadId }) + '\\n');
});
`, 'utf8');
    await chmod(codexBin, 0o755);
    delete process.env.OD_DATA_DIR;
    process.env.CODEX_BIN = wrongCodexBin;
    process.env.CODEX_HOME = path.join(root, 'wrong-default-codex-home');

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'codex-gpt-image-2',
      prompt: 'A compact green app icon with a folded page motif',
      output: 'codex-default-config.png',
    });

    expect(result.providerId).toBe('codex');
    expect(result.providerNote).toContain('codex/gpt-image-2');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'codex-default-config.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('preserves Codex custom gateway credentials for subscription image generation', async () => {
    const dataDir = path.join(root, 'app-data');
    const generatedHome = path.join(root, 'gateway-codex-home');
    const codexBin = path.join(root, 'gateway-codex.mjs');
    const gatewayUrl = 'https://gateway.example.test/v1';
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({
      agentCliEnv: {
        codex: {
          CODEX_BIN: codexBin,
          CODEX_HOME: generatedHome,
          OPENAI_BASE_URL: gatewayUrl,
          OPENAI_API_KEY: 'gateway-openai-key',
        },
      },
    }), 'utf8');
    await writeFile(codexBin, `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const pngBase64 = '${PNG_BASE64}';
const expectedBaseUrl = ${JSON.stringify(gatewayUrl)};
const args = process.argv.slice(2);
const addDirIndex = args.indexOf('--add-dir');
const generatedRoot = addDirIndex >= 0 ? args[addDirIndex + 1] : '';
if (process.env.OPENAI_BASE_URL !== expectedBaseUrl) {
  process.stderr.write('OPENAI_BASE_URL override was not forwarded');
  process.exit(21);
}
if (process.env.OPENAI_API_KEY !== 'gateway-openai-key') {
  process.stderr.write('OPENAI_API_KEY was not preserved for custom gateway');
  process.exit(22);
}
let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { stdin += chunk; });
process.stdin.on('end', () => {
  if (!stdin.includes('$imagegen') || !generatedRoot) process.exit(23);
  const threadId = 'gateway-codex-thread';
  const outDir = path.join(generatedRoot, threadId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'ig_0001.png'), Buffer.from(pngBase64, 'base64'));
  process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: threadId }) + '\\n');
});
`, 'utf8');
    await chmod(codexBin, 0o755);
    process.env.OD_DATA_DIR = dataDir;

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'codex-gpt-image-2',
      prompt: 'A compact green app icon with a folded page motif',
      output: 'codex-gateway.png',
    });

    expect(result.providerId).toBe('codex');
    expect(result.providerNote).toContain('codex/gpt-image-2');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'codex-gateway.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });
});
