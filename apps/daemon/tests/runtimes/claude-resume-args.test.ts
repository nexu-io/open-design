import { describe, expect, it } from 'vitest';
import { claudeAgentDef } from '../../src/runtimes/defs/claude.js';

describe('claude buildArgs session resume', () => {
  it('emits --session-id with the minted id on a create turn', () => {
    const args = claudeAgentDef.buildArgs('prompt', [], [], {}, {
      newSessionId: '11111111-1111-4111-8111-111111111111',
      resumeSessionId: null,
    });
    expect(args).toContain('--session-id');
    expect(args[args.indexOf('--session-id') + 1]).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(args).not.toContain('--resume');
  });

  it('emits --resume with the stored id on a resume turn', () => {
    const args = claudeAgentDef.buildArgs('prompt', [], [], {}, {
      newSessionId: '22222222-2222-4222-8222-222222222222',
      resumeSessionId: 'stored-session-abc',
    });
    expect(args).toContain('--resume');
    expect(args[args.indexOf('--resume') + 1]).toBe('stored-session-abc');
    expect(args).not.toContain('--session-id');
  });

  it('emits neither flag when no session context is supplied (back-compat)', () => {
    const args = claudeAgentDef.buildArgs('prompt', [], [], {}, {});
    expect(args).not.toContain('--resume');
    expect(args).not.toContain('--session-id');
  });

  it('declares it resumes its session via the CLI', () => {
    expect(claudeAgentDef.resumesSessionViaCli).toBe(true);
  });
});
