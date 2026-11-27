import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedProviderIfMissing, writeConfig } from '../../src/media/config.js';

describe('concurrent media configuration writes', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-media-concurrency-'));
    vi.stubEnv('OD_MEDIA_CONFIG_DIR', '');
    vi.stubEnv('OD_DATA_DIR', '');
    vi.stubEnv('OD_SANDBOX_MODE', '1');
    for (const name of ['OD_SENSEAUDIO_API_KEY', 'SENSEAUDIO_API_KEY', 'OD_MINIMAX_API_KEY', 'MINIMAX_API_KEY']) {
      vi.stubEnv(name, '');
    }
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  });

  function file() {
    return path.join(root, '.od', 'media-config.json');
  }

  async function stored() {
    return JSON.parse(await readFile(file(), 'utf8')) as {
      providers: Record<string, { apiKey?: string; baseUrl?: string }>;
      aliases?: Record<string, string>;
    };
  }

  it('keeps both providers when their first chat requests seed together', async () => {
    const results = await Promise.all([
      seedProviderIfMissing(root, 'senseaudio', { apiKey: 'sense-key' }),
      seedProviderIfMissing(root, 'minimax', { apiKey: 'mini-key' }),
    ]);
    expect(results).toEqual([true, true]);
    expect((await stored()).providers).toEqual({
      senseaudio: { apiKey: 'sense-key' },
      minimax: { apiKey: 'mini-key' },
    });
  });

  it('accepts only the first concurrent seed for the same provider', async () => {
    const results = await Promise.all([
      seedProviderIfMissing(root, 'senseaudio', { apiKey: 'first-key' }),
      seedProviderIfMissing(root, 'senseaudio', { apiKey: 'later-key' }),
    ]);
    expect(results).toEqual([true, false]);
    expect((await stored()).providers.senseaudio?.apiKey).toBe('first-key');
  });

  it('preserves a newly seeded key when a concurrent Settings save requests preservation', async () => {
    await Promise.all([
      seedProviderIfMissing(root, 'senseaudio', { apiKey: 'seeded-key' }),
      writeConfig(root, {
        providers: { senseaudio: { preserveApiKey: true, baseUrl: 'https://media.example.test' } },
      }),
    ]);
    expect((await stored()).providers.senseaudio).toEqual({
      apiKey: 'seeded-key', baseUrl: 'https://media.example.test',
    });
  });

  it('coordinates project roots that use the same media configuration directory', async () => {
    vi.stubEnv('OD_MEDIA_CONFIG_DIR', path.join(root, '.od'));
    await Promise.all([
      seedProviderIfMissing(path.join(root, 'project-a'), 'senseaudio', { apiKey: 'sense-key' }),
      seedProviderIfMissing(path.join(root, 'project-b'), 'minimax', { apiKey: 'mini-key' }),
    ]);
    expect(Object.keys((await stored()).providers).sort()).toEqual(['minimax', 'senseaudio']);
  });

  it('preserves aliases across queued seeds', async () => {
    await mkdir(path.dirname(file()), { recursive: true });
    await writeFile(file(), JSON.stringify({ providers: {}, aliases: { old: 'new' } }));
    await Promise.all([
      seedProviderIfMissing(root, 'senseaudio', { apiKey: 'sense-key' }),
      seedProviderIfMissing(root, 'minimax', { apiKey: 'mini-key' }),
    ]);
    const result = await stored();
    expect(result.aliases).toEqual({ old: 'new' });
    expect(Object.keys(result.providers).sort()).toEqual(['minimax', 'senseaudio']);
  });

  it('allows a later write after a rejected transaction', async () => {
    await mkdir(path.dirname(file()), { recursive: true });
    await writeFile(file(), '{');
    await expect(seedProviderIfMissing(root, 'senseaudio', { apiKey: 'first-key' })).rejects.toThrow();
    await writeFile(file(), JSON.stringify({ providers: {} }));
    await expect(seedProviderIfMissing(root, 'senseaudio', { apiKey: 'later-key' })).resolves.toBe(true);
    expect((await stored()).providers.senseaudio?.apiKey).toBe('later-key');
  });
});
