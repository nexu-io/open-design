import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os, { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readAliasMap,
  readMaskedConfig,
  resolveModelAlias,
  resolveProviderConfig,
  writeConfig,
} from '../src/media-config.js';

const TEST_NANOBANANA_BASE_URL = 'https://nano-banana-gateway.example.test';

const OPENAI_ENV_KEYS = [
  'OD_OPENAI_API_KEY',
  'OPENAI_API_KEY',
  'AZURE_API_KEY',
  'AZURE_OPENAI_API_KEY',
];

describe('media-config OpenAI OAuth fallback', () => {
  let homeDir: string;
  let projectRoot: string;
  const originalHome = process.env.HOME;
  const originalEnv = Object.fromEntries(
    OPENAI_ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;
  let homedirSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    homeDir = await mkdtemp(path.join(tmpdir(), 'od-media-home-'));
    projectRoot = await mkdtemp(path.join(tmpdir(), 'od-media-project-'));
    process.env.HOME = homeDir;
    homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(homeDir);
    for (const key of OPENAI_ENV_KEYS) {
      delete process.env[key];
    }
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
  });

  afterEach(async () => {
    if (originalHome == null) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    for (const key of OPENAI_ENV_KEYS) {
      if (originalEnv[key] == null) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
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
    homedirSpy.mockRestore();
    await rm(homeDir, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function writeHomeJson(relPath: string, data: unknown) {
    const file = path.join(homeDir, relPath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  async function writeStoredMediaConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  function openaiProvider(masked: { providers: unknown }) {
    return (masked.providers as Record<string, unknown>).openai;
  }

  it('uses Hermes openai-codex OAuth when no API key is configured', async () => {
    await writeHomeJson('.hermes/auth.json', {
      providers: {
        'openai-codex': {
          tokens: { access_token: 'hermes-oauth-token' },
        },
      },
    });

    const resolved = await resolveProviderConfig(projectRoot, 'openai');
    const masked = await readMaskedConfig(projectRoot);

    expect(resolved.apiKey).toBe('hermes-oauth-token');
    expect(openaiProvider(masked)).toMatchObject({
      configured: true,
      source: 'oauth-hermes',
      apiKeyTail: '',
    });
  });

  it('uses Codex OAuth when Hermes has no OpenAI Codex credential', async () => {
    await writeHomeJson('.codex/auth.json', {
      tokens: { access_token: 'codex-oauth-token' },
    });

    const resolved = await resolveProviderConfig(projectRoot, 'openai');
    const masked = await readMaskedConfig(projectRoot);

    expect(resolved.apiKey).toBe('codex-oauth-token');
    expect(openaiProvider(masked)).toMatchObject({
      configured: true,
      source: 'oauth-codex',
      apiKeyTail: '',
    });
  });

  it('keeps stored provider config ahead of OAuth fallbacks', async () => {
    await writeHomeJson('.hermes/auth.json', {
      providers: {
        'openai-codex': {
          tokens: { access_token: 'hermes-oauth-token' },
        },
      },
    });
    await writeStoredMediaConfig({
      providers: {
        openai: {
          apiKey: 'stored-openai-key',
          baseUrl: 'https://example.test/v1',
        },
      },
    });

    const resolved = await resolveProviderConfig(projectRoot, 'openai');
    const masked = await readMaskedConfig(projectRoot);

    expect(resolved).toEqual({
      apiKey: 'stored-openai-key',
      baseUrl: 'https://example.test/v1',
    });
    expect(openaiProvider(masked)).toMatchObject({
      configured: true,
      source: 'stored',
      apiKeyTail: '-key',
      baseUrl: 'https://example.test/v1',
    });
  });

  it('resolves Nano Banana env and stored model overrides', async () => {
    process.env.OD_NANOBANANA_API_KEY = 'env-nano-key';
    await writeStoredMediaConfig({
      providers: {
        nanobanana: {
          apiKey: 'stored-nano-key',
          baseUrl: TEST_NANOBANANA_BASE_URL,
          model: 'gemini-3.1-flash-image-preview-custom',
        },
      },
    });

    const resolved = await resolveProviderConfig(projectRoot, 'nanobanana');
    const masked = await readMaskedConfig(projectRoot);
    const provider = (masked.providers as Record<string, unknown>).nanobanana;

    expect(resolved).toEqual({
      apiKey: 'env-nano-key',
      baseUrl: TEST_NANOBANANA_BASE_URL,
      model: 'gemini-3.1-flash-image-preview-custom',
    });
    expect(provider).toMatchObject({
      configured: true,
      source: 'env',
      apiKeyTail: '-key',
      baseUrl: TEST_NANOBANANA_BASE_URL,
      model: 'gemini-3.1-flash-image-preview-custom',
    });

    delete process.env.OD_NANOBANANA_API_KEY;
  });

  it('preserves a stored apiKey when writeConfig updates only non-secret fields', async () => {
    await writeStoredMediaConfig({
      providers: {
        openai: {
          apiKey: 'stored-openai-key',
          baseUrl: 'https://before.example/v1',
        },
      },
    });

    await writeConfig(projectRoot, {
      providers: {
        openai: {
          preserveApiKey: true,
          baseUrl: 'https://after.example/v1',
        },
      },
      force: true,
    });

    await expect(resolveProviderConfig(projectRoot, 'openai')).resolves.toEqual({
      apiKey: 'stored-openai-key',
      baseUrl: 'https://after.example/v1',
    });
  });

  describe('OD_MEDIA_CONFIG_DIR / OD_DATA_DIR storage routing', () => {
    let overrideRoot: string;
    let originalMediaConfigDir: string | undefined;
    let originalDataDir: string | undefined;

    beforeEach(async () => {
      overrideRoot = await mkdtemp(path.join(tmpdir(), 'od-media-override-'));
      originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
      originalDataDir = process.env.OD_DATA_DIR;
      delete process.env.OD_MEDIA_CONFIG_DIR;
      delete process.env.OD_DATA_DIR;
    });

    afterEach(async () => {
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
      await rm(overrideRoot, { recursive: true, force: true });
    });

    async function writeProvidersAt(dir: string, data: unknown) {
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, 'media-config.json'),
        JSON.stringify(data),
        'utf8',
      );
    }

    it('reads media-config.json from an absolute OD_MEDIA_CONFIG_DIR', async () => {
      process.env.OD_MEDIA_CONFIG_DIR = overrideRoot;
      await writeProvidersAt(overrideRoot, {
        providers: {
          openai: {
            apiKey: 'absolute-key',
            baseUrl: 'https://absolute.test/v1',
          },
        },
      });

      const resolved = await resolveProviderConfig(projectRoot, 'openai');
      expect(resolved).toEqual({
        apiKey: 'absolute-key',
        baseUrl: 'https://absolute.test/v1',
      });
    });

    it('expands a leading ~/ against the user home directory', async () => {
      // Per-test HOME points at a tmpdir (set by outer beforeEach), so the
      // expansion lands somewhere safe to write.
      const subdir = '.od-test';
      process.env.OD_MEDIA_CONFIG_DIR = `~/${subdir}`;
      const expandedDir = path.join(homeDir, subdir);
      await writeProvidersAt(expandedDir, {
        providers: {
          openai: {
            apiKey: 'tilde-key',
            baseUrl: 'https://tilde.test/v1',
          },
        },
      });

      const resolved = await resolveProviderConfig(projectRoot, 'openai');
      expect(resolved).toEqual({
        apiKey: 'tilde-key',
        baseUrl: 'https://tilde.test/v1',
      });
    });

    it('resolves a relative override against projectRoot, not process.cwd', async () => {
      // process.cwd() during tests is typically the workspace root, which
      // is unrelated to the per-test projectRoot. A relative override must
      // land inside projectRoot, mirroring how resolveDataDir() in
      // server.ts anchors OD_DATA_DIR.
      const relative = 'config/media';
      process.env.OD_MEDIA_CONFIG_DIR = relative;
      const anchoredDir = path.join(projectRoot, relative);
      await writeProvidersAt(anchoredDir, {
        providers: {
          openai: {
            apiKey: 'relative-key',
            baseUrl: 'https://relative.test/v1',
          },
        },
      });

      const resolved = await resolveProviderConfig(projectRoot, 'openai');
      expect(resolved).toEqual({
        apiKey: 'relative-key',
        baseUrl: 'https://relative.test/v1',
      });
    });

    it('falls back to OD_DATA_DIR when OD_MEDIA_CONFIG_DIR is unset', async () => {
      // Packaged daemon (apps/packaged/src/sidecars.ts) and the
      // Home Manager / NixOS modules already set OD_DATA_DIR for the
      // rest of the daemon's runtime state. media-config should
      // co-locate there without needing a second env var.
      process.env.OD_DATA_DIR = overrideRoot;
      await writeProvidersAt(overrideRoot, {
        providers: {
          openai: {
            apiKey: 'datadir-key',
            baseUrl: 'https://datadir.test/v1',
          },
        },
      });

      const resolved = await resolveProviderConfig(projectRoot, 'openai');
      expect(resolved).toEqual({
        apiKey: 'datadir-key',
        baseUrl: 'https://datadir.test/v1',
      });
    });

    it('OD_MEDIA_CONFIG_DIR takes precedence over OD_DATA_DIR', async () => {
      const dataDir = await mkdtemp(path.join(tmpdir(), 'od-media-data-'));
      try {
        process.env.OD_DATA_DIR = dataDir;
        process.env.OD_MEDIA_CONFIG_DIR = overrideRoot;
        // Two competing files; only the OD_MEDIA_CONFIG_DIR one should
        // be read.
        await writeProvidersAt(dataDir, {
          providers: {
            openai: { apiKey: 'data-key', baseUrl: 'https://data/v1' },
          },
        });
        await writeProvidersAt(overrideRoot, {
          providers: {
            openai: { apiKey: 'media-key', baseUrl: 'https://media/v1' },
          },
        });

        const resolved = await resolveProviderConfig(projectRoot, 'openai');
        expect(resolved).toEqual({
          apiKey: 'media-key',
          baseUrl: 'https://media/v1',
        });
      } finally {
        await rm(dataDir, { recursive: true, force: true });
      }
    });

    it('writeConfig creates the override directory tree on first write', async () => {
      // Reproduces the actual user-reported failure mode: the override
      // directory does not exist yet (first launch on a read-only
      // install root), so writeConfig must mkdir -p before writing.
      // Without recursive mkdir + a writable override, this would
      // surface as ENOENT/EROFS to PUT /api/media/config.
      const target = path.join(overrideRoot, 'nested', 'inner');
      process.env.OD_MEDIA_CONFIG_DIR = target;

      await writeConfig(projectRoot, {
        providers: {
          openai: {
            apiKey: 'fresh-write-key',
            baseUrl: 'https://fresh.test/v1',
          },
        },
      });

      // File materialised at the override path.
      const onDisk = await readFile(
        path.join(target, 'media-config.json'),
        'utf8',
      );
      expect(JSON.parse(onDisk)).toEqual({
        providers: {
          openai: {
            apiKey: 'fresh-write-key',
            baseUrl: 'https://fresh.test/v1',
          },
        },
      });

      // And resolveProviderConfig reads it back correctly.
      const resolved = await resolveProviderConfig(projectRoot, 'openai');
      expect(resolved).toEqual({
        apiKey: 'fresh-write-key',
        baseUrl: 'https://fresh.test/v1',
      });
    });

    // Round 3 review feedback on PR #530.
    // resolveOverrideDir shares expandHomePrefix with resolveDataDir, so
    // OD_DATA_DIR=$HOME/.open-design (and ${HOME}/.open-design) routes
    // both daemon runtime data AND media credentials to the same expanded
    // path. Without this, media-config.json was written under
    // <projectRoot>/$HOME/.open-design and stored provider keys appeared
    // missing on the next read.
    it('expands $HOME/... in OD_DATA_DIR fallback so media-config co-locates with daemon data', async () => {
      const subdir = '.od-test-home';
      process.env.OD_DATA_DIR = `$HOME/${subdir}`;
      const expandedDir = path.join(homeDir, subdir);
      await writeProvidersAt(expandedDir, {
        providers: {
          openai: {
            apiKey: 'home-key',
            baseUrl: 'https://home.test/v1',
          },
        },
      });

      const resolved = await resolveProviderConfig(projectRoot, 'openai');
      expect(resolved).toEqual({
        apiKey: 'home-key',
        baseUrl: 'https://home.test/v1',
      });
    });

    it('expands ${HOME}/... in OD_DATA_DIR fallback', async () => {
      const subdir = '.od-test-braced';
      process.env.OD_DATA_DIR = `\${HOME}/${subdir}`;
      const expandedDir = path.join(homeDir, subdir);
      await writeProvidersAt(expandedDir, {
        providers: {
          openai: {
            apiKey: 'braced-key',
            baseUrl: 'https://braced.test/v1',
          },
        },
      });

      const resolved = await resolveProviderConfig(projectRoot, 'openai');
      expect(resolved).toEqual({
        apiKey: 'braced-key',
        baseUrl: 'https://braced.test/v1',
      });
    });

    it('expands $HOME/... in OD_MEDIA_CONFIG_DIR (explicit override path)', async () => {
      const subdir = '.od-media-home';
      process.env.OD_MEDIA_CONFIG_DIR = `$HOME/${subdir}`;
      const expandedDir = path.join(homeDir, subdir);
      await writeProvidersAt(expandedDir, {
        providers: {
          openai: {
            apiKey: 'media-home-key',
            baseUrl: 'https://media-home.test/v1',
          },
        },
      });

      const resolved = await resolveProviderConfig(projectRoot, 'openai');
      expect(resolved).toEqual({
        apiKey: 'media-home-key',
        baseUrl: 'https://media-home.test/v1',
      });
    });
  });
});

describe('media-config model alias resolution (issue #1277)', () => {
  let projectRoot: string;
  const originalEnvAliases = process.env.OD_MEDIA_MODEL_ALIASES;
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'od-media-alias-'));
    delete process.env.OD_MEDIA_MODEL_ALIASES;
    delete process.env.OD_MEDIA_CONFIG_DIR;
    delete process.env.OD_DATA_DIR;
  });

  afterEach(async () => {
    if (originalEnvAliases == null) {
      delete process.env.OD_MEDIA_MODEL_ALIASES;
    } else {
      process.env.OD_MEDIA_MODEL_ALIASES = originalEnvAliases;
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
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function writeStoredMediaConfig(data: unknown) {
    const file = path.join(projectRoot, '.od', 'media-config.json');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf8');
  }

  it('passes through unmapped model ids unchanged', async () => {
    expect(await resolveModelAlias(projectRoot, 'doubao-seedream-3-0-t2i-250415')).toBe(
      'doubao-seedream-3-0-t2i-250415',
    );
  });

  it('redirects via the stored aliases map in media-config.json', async () => {
    // The flagship use case from the issue: registered catalog id
    // -> the new model name the user actually has access to.
    await writeStoredMediaConfig({
      providers: {},
      aliases: { 'doubao-seedream-3-0-t2i-250415': 'doubao-seedream-5-0' },
    });
    expect(
      await resolveModelAlias(projectRoot, 'doubao-seedream-3-0-t2i-250415'),
    ).toBe('doubao-seedream-5-0');
  });

  it('redirects via the OD_MEDIA_MODEL_ALIASES env var', async () => {
    process.env.OD_MEDIA_MODEL_ALIASES = JSON.stringify({
      'doubao-seedream-3-0-t2i-250415': 'doubao-seedream-5-0',
    });
    expect(
      await resolveModelAlias(projectRoot, 'doubao-seedream-3-0-t2i-250415'),
    ).toBe('doubao-seedream-5-0');
  });

  it('lets the env var override an on-disk alias (env wins for power users)', async () => {
    await writeStoredMediaConfig({
      providers: {},
      aliases: { 'doubao-seedream-3-0-t2i-250415': 'on-disk-alias' },
    });
    process.env.OD_MEDIA_MODEL_ALIASES = JSON.stringify({
      'doubao-seedream-3-0-t2i-250415': 'env-alias',
    });
    expect(
      await resolveModelAlias(projectRoot, 'doubao-seedream-3-0-t2i-250415'),
    ).toBe('env-alias');
  });

  it('tolerates malformed env JSON and falls through to the stored map', async () => {
    // A user with a half-typed env var (`OD_MEDIA_MODEL_ALIASES='{'`)
    // should still get their on-disk aliases, not a hard error mid-
    // generation.
    process.env.OD_MEDIA_MODEL_ALIASES = '{not valid json';
    await writeStoredMediaConfig({
      providers: {},
      aliases: { 'doubao-seedream-3-0-t2i-250415': 'doubao-seedream-5-0' },
    });
    expect(
      await resolveModelAlias(projectRoot, 'doubao-seedream-3-0-t2i-250415'),
    ).toBe('doubao-seedream-5-0');
  });

  it('drops non-string and empty alias entries during coercion', async () => {
    // Defends against a future schema bump (number / null / nested
    // object) and against accidental empty-string entries from a
    // Settings UI form. The coercion must never feed garbage into a
    // dispatcher's request body.
    process.env.OD_MEDIA_MODEL_ALIASES = JSON.stringify({
      'good-key': 'good-value',
      'empty-key': '',
      'null-key': null,
      'object-key': { nested: 'no' },
      '': 'blank-key-rejected',
    });
    expect(await resolveModelAlias(projectRoot, 'good-key')).toBe('good-value');
    expect(await resolveModelAlias(projectRoot, 'empty-key')).toBe('empty-key');
    expect(await resolveModelAlias(projectRoot, 'null-key')).toBe('null-key');
    expect(await resolveModelAlias(projectRoot, 'object-key')).toBe('object-key');
  });

  it('exposes the merged map via readAliasMap so Settings can show source attribution', async () => {
    await writeStoredMediaConfig({
      providers: {},
      aliases: { 'stored-only': 'a', 'overridden': 'stored-value' },
    });
    process.env.OD_MEDIA_MODEL_ALIASES = JSON.stringify({
      'env-only': 'b',
      'overridden': 'env-value',
    });
    const map = await readAliasMap(projectRoot);
    expect(map.stored).toEqual({ 'stored-only': 'a', 'overridden': 'stored-value' });
    expect(map.env).toEqual({ 'env-only': 'b', 'overridden': 'env-value' });
    expect(map.effective).toEqual({
      'stored-only': 'a',
      'env-only': 'b',
      'overridden': 'env-value',
    });
  });

  it('readMaskedConfig surfaces the alias map for the Settings UI', async () => {
    // Lefarcen P3 (#1309 review): the prior PR description claimed
    // `readAliasMap` was the daemon-public API for the Settings UI,
    // but the HTTP route returned only `readMaskedConfig` (which
    // had no aliases field). The fix wires aliases into the GET
    // response so a future Settings UI PR can consume them without
    // touching the daemon.
    await writeStoredMediaConfig({
      providers: {},
      aliases: { 'dall-e-3': 'azure-dalle3' },
    });
    process.env.OD_MEDIA_MODEL_ALIASES = JSON.stringify({
      'gpt-4o-mini-tts': 'custom-tts',
    });

    const masked = await readMaskedConfig(projectRoot);

    expect(masked.aliases.stored).toEqual({ 'dall-e-3': 'azure-dalle3' });
    expect(masked.aliases.env).toEqual({ 'gpt-4o-mini-tts': 'custom-tts' });
    expect(masked.aliases.effective).toEqual({
      'dall-e-3': 'azure-dalle3',
      'gpt-4o-mini-tts': 'custom-tts',
    });
  });

  it('readMaskedConfig returns empty alias maps when no aliases are configured', async () => {
    // Settings UI needs a stable shape so it can render "no aliases
    // configured" without crashing on `aliases.effective` being
    // undefined.
    const masked = await readMaskedConfig(projectRoot);
    expect(masked.aliases.effective).toEqual({});
    expect(masked.aliases.env).toEqual({});
    expect(masked.aliases.stored).toEqual({});
  });

  it('writeConfig preserves aliases when a Settings-style provider PUT lands', async () => {
    // The Settings UI in its current shape writes providers only.
    // Without alias preservation, every provider edit would wipe the
    // user's aliases. This pins the regression so a future refactor
    // that touches writeStored has to keep both fields.
    await writeStoredMediaConfig({
      providers: {},
      aliases: { 'doubao-seedream-3-0-t2i-250415': 'doubao-seedream-5-0' },
    });
    await writeConfig(projectRoot, {
      providers: {
        openai: { apiKey: 'sk-key', baseUrl: '' },
      },
    });
    const onDisk = JSON.parse(
      await readFile(
        path.join(projectRoot, '.od', 'media-config.json'),
        'utf8',
      ),
    );
    expect(onDisk.providers.openai).toMatchObject({ apiKey: 'sk-key' });
    expect(onDisk.aliases).toEqual({
      'doubao-seedream-3-0-t2i-250415': 'doubao-seedream-5-0',
    });
    expect(
      await resolveModelAlias(projectRoot, 'doubao-seedream-3-0-t2i-250415'),
    ).toBe('doubao-seedream-5-0');
  });
});
