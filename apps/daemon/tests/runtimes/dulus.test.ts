import { describe, expect, it } from 'vitest';
import { dulusAgentDef } from '../../src/runtimes/defs/dulus.js';
import { DEFAULT_MODEL_OPTION } from '../../src/runtimes/defs/shared.js';

describe('dulus buildArgs', () => {
  it('passes the prompt positionally behind an option terminator', () => {
    const prompt = 'design a landing page';
    const args = dulusAgentDef.buildArgs(prompt, [], [], {});

    expect(args).toEqual(['--print', '--accept-all', '--', prompt]);
  });

  // Dulus parses the prompt as an argparse positional, so a composed prompt
  // that opens with a dash would otherwise be read as an unknown flag.
  it('keeps a dash-leading prompt out of option parsing', () => {
    const prompt = '--- section divider prompt';
    const args = dulusAgentDef.buildArgs(prompt, [], [], {});

    expect(args.indexOf('--')).toBeLessThan(args.indexOf(prompt));
    expect(args.at(-1)).toBe(prompt);
  });

  it('appends --model before the terminator for a non-default model', () => {
    const args = dulusAgentDef.buildArgs('prompt', [], [], { model: 'gpt-5.2' });

    expect(args).toEqual([
      '--print',
      '--accept-all',
      '--model',
      'gpt-5.2',
      '--',
      'prompt',
    ]);
  });

  it('omits --model for the default sentinel', () => {
    const args = dulusAgentDef.buildArgs('prompt', [], [], {
      model: DEFAULT_MODEL_OPTION.id,
    });

    expect(args).not.toContain('--model');
  });
});

describe('dulus definition metadata', () => {
  it('declares the runtime identity', () => {
    expect(dulusAgentDef.id).toBe('dulus');
    expect(dulusAgentDef.name).toBe('Dulus');
    expect(dulusAgentDef.bin).toBe('dulus');
  });

  it('guards the argv prompt budget and streams plain text', () => {
    expect(dulusAgentDef.maxPromptArgBytes).toBe(30_000);
    expect(dulusAgentDef.streamFormat).toBe('plain');
  });

  // Without this, a --print run hands the prompt to an already-running Dulus
  // daemon, which executes it in that process's cwd instead of the OD project.
  it('disables Dulus client-side IPC dispatch', () => {
    expect(dulusAgentDef.env).toEqual({ DULUS_NO_IPC: '1' });
  });
});
