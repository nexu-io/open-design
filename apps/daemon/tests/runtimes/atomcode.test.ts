import { describe, expect, it } from 'vitest';
import { atomcodeAgentDef } from '../../src/runtimes/defs/atomcode.js';
import { DEFAULT_MODEL_OPTION } from '../../src/runtimes/defs/shared.js';

const promptFileContext = { promptFilePath: '/tmp/open-design/atomcode-prompt.md' };

describe('atomcode buildArgs', () => {
  it('requires a staged prompt file', () => {
    expect(() => atomcodeAgentDef.buildArgs('prompt', [], [], {}, {})).toThrow(
      'atomcode requires runtimeContext.promptFilePath',
    );
  });

  it('emits the exact base argv without embedding the prompt', () => {
    const prompt = 'do not put this prompt in argv';
    const args = atomcodeAgentDef.buildArgs(prompt, [], [], {}, promptFileContext);

    expect(args).toEqual([
      '--prompt-file',
      promptFileContext.promptFilePath,
      '-y',
    ]);
    expect(args).not.toContain(prompt);
  });

  it('appends --model for a non-default model', () => {
    const args = atomcodeAgentDef.buildArgs(
      'prompt',
      [],
      [],
      { model: 'claude-sonnet-4-6' },
      promptFileContext,
    );

    expect(args).toEqual([
      '--prompt-file',
      promptFileContext.promptFilePath,
      '-y',
      '--model',
      'claude-sonnet-4-6',
    ]);
  });

  it('omits --model for the default sentinel', () => {
    const args = atomcodeAgentDef.buildArgs(
      'prompt',
      [],
      [],
      { model: DEFAULT_MODEL_OPTION.id },
      promptFileContext,
    );

    expect(args).not.toContain('--model');
  });
});

describe('atomcode definition metadata', () => {
  it('declares the runtime identity', () => {
    expect(atomcodeAgentDef.id).toBe('atomcode');
    expect(atomcodeAgentDef.name).toBe('AtomCode CLI');
    expect(atomcodeAgentDef.bin).toBe('atomcode');
  });

  it('uses prompt-file transport and plain output', () => {
    expect(atomcodeAgentDef.promptViaFile).toBe(true);
    expect(atomcodeAgentDef.promptViaStdin).toBe(false);
    expect(atomcodeAgentDef.streamFormat).toBe('plain');
  });
});
