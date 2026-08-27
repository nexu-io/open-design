import { describe, expect, it } from 'vitest';
import { dulusAgentDef } from '../../src/runtimes/defs/dulus.js';
import { DEFAULT_MODEL_OPTION } from '../../src/runtimes/defs/shared.js';

describe('dulus buildArgs', () => {
  it('emits the non-interactive base argv without embedding the prompt', () => {
    const prompt = 'do not put this prompt in argv';
    const args = dulusAgentDef.buildArgs(prompt, [], [], {});

    expect(args).toEqual(['run', '--print']);
    expect(args).not.toContain(prompt);
  });

  it('appends --model for a non-default model', () => {
    const args = dulusAgentDef.buildArgs('prompt', [], [], { model: 'dulus-pro' });

    expect(args).toEqual(['run', '--print', '--model', 'dulus-pro']);
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

  it('uses stdin prompt transport and plain output', () => {
    expect(dulusAgentDef.promptViaStdin).toBe(true);
    expect(dulusAgentDef.streamFormat).toBe('plain');
  });
});
