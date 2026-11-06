import { Context } from '@deepseek-ai/cordis';
import { ShellEnvRegistry } from '@deepseek-ai/dsh-shell-env';
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apply } from '../src/index.js';

afterEach(() => vi.unstubAllEnvs());

describe('OpenDesign tool shell environment', () => {
  function registry() {
    const shellEnv = new ShellEnvRegistry(new Context());
    apply({
      openDesignStartup: { mode: 'models' },
      shellEnv,
      get: (key: string) => key === 'appExit' ? () => {} : undefined,
    } as never);
    return shellEnv;
  }

  it('passes only the current run token through the trusted shell overlay', () => {
    vi.stubEnv('OD_TOOL_TOKEN', 'fixture-run-one');
    vi.stubEnv('DSH_OD_TOOL_TOKEN', 'fixture-stale-parent');
    vi.stubEnv('OD_API_KEY', 'fixture-unrelated-secret');
    const shellEnv = registry();
    const collect = (): Record<string, string> => ({ ...scrubbedParentEnv(), ...shellEnv.collect({} as never) });

    expect(collect()).toMatchObject({ DSH_OD_TOOL_TOKEN: 'fixture-run-one', DSH_SHELL: '1' });
    expect(collect()).not.toHaveProperty('OD_TOOL_TOKEN');
    expect(collect()).not.toHaveProperty('OD_API_KEY');
    expect(JSON.stringify(shellEnv.list())).not.toContain('fixture-run-one');

    vi.stubEnv('OD_TOOL_TOKEN', 'fixture-run-two');
    expect(collect().DSH_OD_TOOL_TOKEN).toBe('fixture-run-two');
    vi.stubEnv('OD_TOOL_TOKEN', undefined);
    expect(collect()).not.toHaveProperty('DSH_OD_TOOL_TOKEN');
  });

  it('does not forward an empty token', () => {
    vi.stubEnv('OD_TOOL_TOKEN', '');
    expect(registry().collect({} as never)).not.toHaveProperty('DSH_OD_TOOL_TOKEN');
  });
});
