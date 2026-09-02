import { describe, expect, it } from 'vitest';
import { ompAgentDef } from '../../src/runtimes/defs/omp.js';
import { DEFAULT_MODEL_OPTION } from '../../src/runtimes/defs/shared.js';
import { installMetaForAgent } from '../../src/runtimes/metadata.js';

describe('omp buildArgs', () => {
  it('runs RPC mode with the pi-rpc capture session dir', () => {
    const args = ompAgentDef.buildArgs('prompt', [], [], {}, { cwd: '/tmp/od-project' });
    expect(args).toContain('--mode');
    expect(args).toContain('rpc');
    expect(args).toEqual(
      expect.arrayContaining(['--session-dir', '/tmp/od-project/.pi/sessions']),
    );
  });

  it('passes model and thinking through for omp to fuzzy-match', () => {
    const args = ompAgentDef.buildArgs(
      'prompt',
      [],
      [],
      { model: 'anthropic/claude-opus-4-5', reasoning: 'high' },
      { cwd: '/tmp/od-project' },
    );
    expect(args).toEqual(
      expect.arrayContaining(['--model', 'anthropic/claude-opus-4-5', '--thinking', 'high']),
    );
  });

  it('omits model/thinking sentinels and never puts the prompt in argv', () => {
    const args = ompAgentDef.buildArgs('secret prompt', [], [], {}, { cwd: '/tmp/od-project' });
    expect(args).not.toContain('secret prompt');
    expect(args).not.toContain('--model');
    expect(args).not.toContain('--thinking');
  });

  it('forwards absolute extra dirs via repeatable --add-dir', () => {
    const args = ompAgentDef.buildArgs(
      'prompt',
      [],
      ['/home/u/design-systems', 'relative/junk'],
      {},
      {},
    );
    expect(args).toEqual(expect.arrayContaining(['--add-dir', '/home/u/design-systems']));
    expect(args).not.toContain('relative/junk');
    expect(args.filter((a) => a === '--add-dir')).toHaveLength(1);
  });
});

describe('omp definition metadata', () => {
  it('declares the runtime identity', () => {
    expect(ompAgentDef.id).toBe('omp');
    expect(ompAgentDef.bin).toBe('omp');
    expect(ompAgentDef.streamFormat).toBe('pi-rpc');
    expect(ompAgentDef.promptViaStdin).toBe(true);
    expect(ompAgentDef.supportsImagePaths).toBe(true);
  });

  it('falls back to provider model hints including the default sentinel', () => {
    expect(ompAgentDef.fallbackModels[0]).toEqual(DEFAULT_MODEL_OPTION);
    expect(ompAgentDef.fallbackModels.length).toBeGreaterThan(1);
  });

  it('offers omp thinking levels including max', () => {
    const ids = ompAgentDef.reasoningOptions.map((option) => option.id);
    expect(ids).toEqual(expect.arrayContaining(['default', 'off', 'high', 'xhigh', 'max']));
  });

  it('exposes official install and docs metadata for unavailable-agent discovery', () => {
    const meta = installMetaForAgent('omp');
    expect(meta.installUrl).toBe('https://omp.sh/');
    expect(meta.docsUrl).toBe('https://github.com/can1357/oh-my-pi');
  });
});
