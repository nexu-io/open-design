import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readMaskedConfig, resolveProviderConfig } from '../src/media-config.js';

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
});
