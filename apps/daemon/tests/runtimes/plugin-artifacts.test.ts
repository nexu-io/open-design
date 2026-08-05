import { describe, expect, it } from 'vitest';
import { hasGeneratedPluginArtifacts } from '../../src/runtimes/plugin-artifacts.js';

describe('hasGeneratedPluginArtifacts', () => {
  it('requires both generated plugin files', async () => {
    const accessed: string[] = [];
    const result = await hasGeneratedPluginArtifacts('/tmp/project', {
      access: async (file) => { accessed.push(file); },
    });

    expect(result).toBe(true);
    expect(accessed).toEqual([
      '/tmp/project/generated-plugin/open-design.json',
      '/tmp/project/generated-plugin/SKILL.md',
    ]);
  });

  it('returns false when either artifact is missing', async () => {
    const result = await hasGeneratedPluginArtifacts('/tmp/project', {
      access: async (file) => {
        if (file.endsWith('SKILL.md')) throw new Error('missing');
      },
    });

    expect(result).toBe(false);
  });

  it('rejects an absent project root without filesystem access', async () => {
    let calls = 0;
    const result = await hasGeneratedPluginArtifacts(null, {
      access: async () => { calls += 1; },
    });

    expect(result).toBe(false);
    expect(calls).toBe(0);
  });
});
