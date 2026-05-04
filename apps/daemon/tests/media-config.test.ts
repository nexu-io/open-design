import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  readMaskedConfig,
  resolveProviderConfig,
  writeConfig,
} from '../src/media-config.js';

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

  beforeEach(async () => {
    homeDir = await mkdtemp(path.join(tmpdir(), 'od-media-home-'));
    projectRoot = await mkdtemp(path.join(tmpdir(), 'od-media-project-'));
    process.env.HOME = homeDir;
    for (const key of OPENAI_ENV_KEYS) {
      delete process.env[key];
    }
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
  });
});
