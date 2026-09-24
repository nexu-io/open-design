import { describe, expect, it } from 'vitest';
import { grokBuildAgentDef } from '../../src/runtimes/defs/grok-build.js';

const PROMPT_FILE = '/tmp/od-grok-prompt.md';

function grokArgs(runtimeContext: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
  return grokBuildAgentDef.buildArgs('prompt', [], [], options, {
    promptFilePath: PROMPT_FILE,
    ...runtimeContext,
  });
}

describe('grok-build buildArgs session resume', () => {
  it('emits --session-id with the minted id on a create turn', () => {
    const args = grokArgs({
      newSessionId: '11111111-1111-4111-8111-111111111111',
      resumeSessionId: null,
    });
    expect(args).toContain('--prompt-file');
    expect(args[args.indexOf('--prompt-file') + 1]).toBe(PROMPT_FILE);
    expect(args).toContain('--session-id');
    expect(args[args.indexOf('--session-id') + 1]).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(args).not.toContain('--resume');
  });

  it('emits --resume with the stored id on a resume turn', () => {
    const args = grokArgs({
      newSessionId: '22222222-2222-4222-8222-222222222222',
      resumeSessionId: '33333333-3333-4333-8333-333333333333',
    });
    expect(args).toContain('--resume');
    expect(args[args.indexOf('--resume') + 1]).toBe(
      '33333333-3333-4333-8333-333333333333',
    );
    expect(args).not.toContain('--session-id');
  });

  it('emits neither session flag when no session context is supplied', () => {
    const args = grokArgs({});
    expect(args).not.toContain('--resume');
    expect(args).not.toContain('--session-id');
    expect(args).toEqual([
      '--prompt-file',
      PROMPT_FILE,
      '--no-plan',
      '--always-approve',
    ]);
  });

  it('keeps model overrides after the session flags', () => {
    const args = grokArgs(
      { resumeSessionId: '33333333-3333-4333-8333-333333333333' },
      { model: 'grok-4.6' },
    );
    const resumeIndex = args.indexOf('--resume');
    const modelIndex = args.indexOf('--model');
    expect(resumeIndex).toBeGreaterThan(-1);
    expect(modelIndex).toBeGreaterThan(resumeIndex);
    expect(args[modelIndex + 1]).toBe('grok-4.6');
  });

  it('declares it resumes its session via the CLI', () => {
    expect(grokBuildAgentDef.resumesSessionViaCli).toBe(true);
  });
});
