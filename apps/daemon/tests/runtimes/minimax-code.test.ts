import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/runtimes/defs/shared.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/runtimes/defs/shared.js')>();
  return {
    ...actual,
    detectAcpModels: vi.fn(async () => [
      { id: 'MiniMax-M2.7', label: 'MiniMax-M2.7' },
    ]),
  };
});

import {
  DEFAULT_MODEL_OPTION,
  detectAcpModels,
} from '../../src/runtimes/defs/shared.js';
import { minimaxCodeAgentDef } from '../../src/runtimes/defs/minimax-code.js';
import { installMetaForAgent } from '../../src/runtimes/metadata.js';
import { getAgentDef } from '../../src/runtimes/registry.js';
import type { RuntimeAgentDef, RuntimeEnv } from '../../src/runtimes/types.js';

const rootUrl = new URL('../../../../', import.meta.url);

async function readRepoFile(path: string) {
  return readFile(new URL(path, rootUrl), 'utf8');
}

describe('MiniMax Code runtime adapter', () => {
  it('defines MiniMax Code as a public ACP adapter', () => {
    const runtimeDef = minimaxCodeAgentDef as RuntimeAgentDef;

    expect(minimaxCodeAgentDef.id).toBe('minimax-code');
    expect(minimaxCodeAgentDef.name).toBe('MiniMax Code');
    expect(minimaxCodeAgentDef.bin).toBe('mcode');
    expect(runtimeDef.fallbackBins).toBeUndefined();
    expect(minimaxCodeAgentDef.versionArgs).toEqual(['--version']);
    expect(minimaxCodeAgentDef.streamFormat).toBe('acp-json-rpc');
    expect(runtimeDef.mcpDiscovery).toBe('mature-acp');
    expect(runtimeDef.externalMcpInjection).toBe('acp-merge');
    expect(runtimeDef.supportsCustomModel).toBe(false);
    expect(runtimeDef.resumesSessionViaAcpLoad).not.toBe(true);
  });

  it('launches the documented ACP stdio server', () => {
    const runtimeDef = minimaxCodeAgentDef as RuntimeAgentDef;
    expect(runtimeDef.buildArgs('', [], [], {})).toEqual(['acp']);
  });

  it('fetches live models from mcode acp', async () => {
    const env: RuntimeEnv = { PATH: '/opt/bin' };

    await expect(
      minimaxCodeAgentDef.fetchModels?.('/opt/bin/mcode', env),
    ).resolves.toEqual([{ id: 'MiniMax-M2.7', label: 'MiniMax-M2.7' }]);

    expect(detectAcpModels).toHaveBeenCalledWith(
      expect.objectContaining({
        bin: '/opt/bin/mcode',
        args: ['acp'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    );
  });

  it('registers MiniMax Code in the agent registry', () => {
    expect(getAgentDef('minimax-code')).toBe(minimaxCodeAgentDef);
  });

  it('exposes public install metadata and docs', async () => {
    const meta = installMetaForAgent('minimax-code');
    expect(meta.installUrl).toBe('https://github.com/MiniMax-AI/minimax-code');
    expect(meta.docsUrl).toBe(
      'https://agent.minimax.io/docs/cli/quick-start',
    );

    const publicSurface = [
      await readRepoFile('apps/daemon/src/runtimes/defs/minimax-code.ts'),
      await readRepoFile('apps/daemon/src/runtimes/metadata.ts'),
      await readRepoFile('docs/agent-adapters.md'),
    ].join('\n');

    expect(publicSurface).toContain('mcode acp');
    expect(publicSurface).toContain('MiniMax-AI/minimax-code');
  });
});
