import { describe, expect, it } from 'vitest';
import { opencodeAgentDef } from '../../src/runtimes/defs/opencode.js';

// OpenCode is capture-style: it mints its own session id (reported on the
// stream's `step_start.sessionID`) rather than accepting a daemon-minted one.
// A create turn passes NO id (plain `run`); a resume turn continues the stored
// session with `-s <id>`.
describe('opencode buildArgs session resume', () => {
  const SESSION = 'ses_4af9c2e1b0';

  it('uses plain `run` (no `-s`) on a create turn', () => {
    const args = opencodeAgentDef.buildArgs('prompt', [], [], {}, {
      newSessionId: '11111111-1111-4111-8111-111111111111',
      resumeSessionId: null,
    });
    expect(args.slice(0, 3)).toEqual(['run', '--format', 'json']);
    expect(args).not.toContain('-s');
    // The minted daemon id must NOT leak into argv.
    expect(args).not.toContain('11111111-1111-4111-8111-111111111111');
  });

  it('continues the stored session with `-s <id>` on a resume turn', () => {
    const args = opencodeAgentDef.buildArgs('prompt', [], [], {}, {
      resumeSessionId: SESSION,
    });
    expect(args).toContain('-s');
    expect(args[args.indexOf('-s') + 1]).toBe(SESSION);
  });

  it('keeps the model flag alongside the resume flag', () => {
    const args = opencodeAgentDef.buildArgs(
      'prompt',
      [],
      [],
      { model: 'anthropic/claude-sonnet-4-5' },
      { resumeSessionId: SESSION },
    );
    expect(args[args.indexOf('-s') + 1]).toBe(SESSION);
    expect(args[args.indexOf('-m') + 1]).toBe('anthropic/claude-sonnet-4-5');
  });

  it('uses plain `run` when no session context is supplied (back-compat)', () => {
    const args = opencodeAgentDef.buildArgs('prompt', [], [], {}, {});
    expect(args.slice(0, 3)).toEqual(['run', '--format', 'json']);
    expect(args).not.toContain('-s');
  });

  it('declares CLI-managed, capture-style session resume', () => {
    expect(opencodeAgentDef.resumesSessionViaCli).toBe(true);
    expect(opencodeAgentDef.capturesSessionIdFromStream).toBe(true);
  });
});
