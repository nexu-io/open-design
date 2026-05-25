import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/runtimes/defs/shared.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/runtimes/defs/shared.js')>();
  return {
    ...actual,
    detectAcpModels: vi.fn(async () => [
      { id: 'live-trae-model', label: 'Live Trae model' },
    ]),
  };
});

import {
  DEFAULT_MODEL_OPTION,
  detectAcpModels,
} from '../../src/runtimes/defs/shared.js';
import { traeCliAgentDef } from '../../src/runtimes/defs/trae-cli.js';
import { installMetaForAgent } from '../../src/runtimes/metadata.js';
import { getAgentDef } from '../../src/runtimes/registry.js';
import type { RuntimeAgentDef, RuntimeEnv } from '../../src/runtimes/types.js';

const rootUrl = new URL('../../../../', import.meta.url);

async function readRepoFile(path: string) {
  return readFile(new URL(path, rootUrl), 'utf8');
}

describe('Trae CLI runtime adapter', () => {
  it('defines Trae CLI as a public ACP adapter', () => {
    const runtimeDef = traeCliAgentDef as RuntimeAgentDef;

    expect(traeCliAgentDef.id).toBe('trae-cli');
    expect(traeCliAgentDef.name).toBe('Trae CLI');
    expect(traeCliAgentDef.bin).toBe('traecli');
    expect(runtimeDef.fallbackBins).toBeUndefined();
    expect(traeCliAgentDef.versionArgs).toEqual(['--version']);
    expect(traeCliAgentDef.versionProbeTimeoutMs).toBeGreaterThan(3000);
    expect(runtimeDef.buildArgs('', [], [], {})).toEqual(['acp', 'serve']);
    expect(traeCliAgentDef.streamFormat).toBe('acp-json-rpc');
  });

  it('fetches live models from traecli acp serve', async () => {
    const env: RuntimeEnv = { PATH: '/opt/bin' };

    await expect(
      traeCliAgentDef.fetchModels?.('/opt/bin/traecli', env),
    ).resolves.toEqual([{ id: 'live-trae-model', label: 'Live Trae model' }]);

    expect(detectAcpModels).toHaveBeenCalledWith(
      expect.objectContaining({
        bin: '/opt/bin/traecli',
        args: ['acp', 'serve'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    );
  });

  it('registers Trae CLI in the agent registry', () => {
    expect(getAgentDef('trae-cli')).toBe(traeCliAgentDef);
  });

  it('exposes public install metadata and docs without internal COCO leakage', async () => {
    const meta = installMetaForAgent('trae-cli');
    expect(meta.installUrl).toBe(
      'https://www.volcengine.com/docs/86677/2227861?lang=zh',
    );
    expect(meta.docsUrl).toBe(
      'https://www.volcengine.com/docs/86677/2227861?lang=zh',
    );

    const publicSurface = [
      await readRepoFile('apps/daemon/src/runtimes/defs/trae-cli.ts'),
      await readRepoFile('apps/daemon/src/runtimes/metadata.ts'),
      await readRepoFile('docs/agent-adapters.md'),
    ].join('\n');

    for (const forbidden of [
      'coco',
      'code.byted.org',
      'codebase-api.byted.org',
      'bytedance',
      '/Users/bytedance',
      'ByteDance SSO',
      'install_coco',
      'GPT-5.4',
    ]) {
      expect(publicSurface.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
