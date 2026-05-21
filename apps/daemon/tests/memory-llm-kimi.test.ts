import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { pickProvider } from '../src/memory-llm.js';
import { writeMemoryConfig } from '../src/memory.js';

describe('pickProvider — kimi wiring', () => {
  let tempDir: string;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-memory-kimi-'));
    delete process.env.OD_KIMI_API_KEY;
    delete process.env.KIMI_API_KEY;
    delete process.env.MOONSHOT_API_KEY;
    delete process.env.OD_MEMORY_MODEL;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    process.env = { ...savedEnv };
  });

  it('resolves an explicit kimi memory override to the moonshot defaults', async () => {
    await writeMemoryConfig(tempDir, {
      extraction: { provider: 'kimi', apiKey: 'sk-kimi-explicit', model: 'kimi-k2.6' },
    });

    const provider = await pickProvider(null, tempDir, null, null, null);
    expect(provider).toMatchObject({
      kind: 'kimi',
      apiKey: 'sk-kimi-explicit',
      model: 'kimi-k2.6',
      baseUrl: 'https://api.moonshot.ai',
      credentialSource: 'memory-config',
    });
  });

  it('falls back to envKeyFor(kimi) when the override has no apiKey', async () => {
    process.env.KIMI_API_KEY = 'sk-kimi-from-env';
    await writeMemoryConfig(tempDir, {
      extraction: { provider: 'kimi', model: 'moonshot-v1-32k' },
    });

    const provider = await pickProvider(null, tempDir, null, null, null);
    expect(provider).toMatchObject({
      kind: 'kimi',
      apiKey: 'sk-kimi-from-env',
      model: 'moonshot-v1-32k',
      baseUrl: 'https://api.moonshot.ai',
      credentialSource: 'env',
    });
  });

  it('honors MOONSHOT_API_KEY as a vendor-branded fallback', async () => {
    process.env.MOONSHOT_API_KEY = 'sk-ms-vendor';
    await writeMemoryConfig(tempDir, {
      extraction: { provider: 'kimi' },
    });

    const provider = (await pickProvider(null, tempDir, null, null, null)) as any;
    expect(provider?.apiKey).toBe('sk-ms-vendor');
    expect(provider?.kind).toBe('kimi');
  });

  it('honors OD_KIMI_API_KEY as the highest-priority fallback', async () => {
    process.env.OD_KIMI_API_KEY = 'sk-od-kimi';
    process.env.KIMI_API_KEY = 'sk-kimi-secondary';
    process.env.MOONSHOT_API_KEY = 'sk-ms-tertiary';
    await writeMemoryConfig(tempDir, {
      extraction: { provider: 'kimi' },
    });

    const provider = (await pickProvider(null, tempDir, null, null, null)) as any;
    expect(provider?.apiKey).toBe('sk-od-kimi');
  });

  it('follows the API-mode "Same as chat" path when chatProvider.provider is kimi (chat model wins when supplied)', async () => {
    const chatProvider = {
      provider: 'kimi' as const,
      apiKey: 'sk-kimi-byok',
      baseUrl: 'https://api.moonshot.ai',
      apiVersion: '',
      model: 'kimi-k2.6',
    };
    const provider = await pickProvider(null, tempDir, null, chatProvider, null);
    expect(provider).toMatchObject({
      kind: 'kimi',
      apiKey: 'sk-kimi-byok',
      baseUrl: 'https://api.moonshot.ai',
      model: 'kimi-k2.6',
    });
  });

  it('falls back to the kimi fast-model default when chatProvider has no model', async () => {
    const chatProvider = {
      provider: 'kimi' as const,
      apiKey: 'sk-kimi-byok',
      baseUrl: 'https://api.moonshot.ai',
      apiVersion: '',
      model: '',
    };
    const provider = (await pickProvider(null, tempDir, null, chatProvider, null)) as any;
    expect(provider?.model).toBe('moonshot-v1-8k');
  });

  it('returns null when a kimi override has no apiKey and no env fallback', async () => {
    await writeMemoryConfig(tempDir, {
      extraction: { provider: 'kimi', model: 'moonshot-v1-8k' },
    });
    const provider = await pickProvider(null, tempDir, null, null, null);
    expect(provider).toBeNull();
  });
});
