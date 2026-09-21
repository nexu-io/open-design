import { describe, expect, it } from 'vitest';

import { agentDeclaredBlockSettlesRun } from '../../../src/strategies/od-next/blocked-run-outcome.js';

const DECLARED = 'od_next_agent_declared_block';

describe('agentDeclaredBlockSettlesRun', () => {
  it('settles a block the agent declared on itself and explained to the user', () => {
    expect(agentDeclaredBlockSettlesRun({
      outcome: 'blocked',
      blockedContext: {
        reasonCodes: [DECLARED],
        visibleText: '已 commit 並推送。settings-r3 領先 main 四個 commit。',
      },
    })).toBe(true);
  });

  it('keeps failing a block the agent never declared, prose or no prose', () => {
    // A missing Runtime State next to a full reply is the agent's ordinary
    // answer, not an account of the stop — the gate must still be reported.
    expect(agentDeclaredBlockSettlesRun({
      outcome: 'blocked',
      blockedContext: {
        reasonCodes: ['od_next_protocol_runtime_state_missing'],
        visibleText: '好的，按你说的三页来做。',
      },
    })).toBe(false);
  });

  it('keeps failing a declared block that left the user nothing to read', () => {
    expect(agentDeclaredBlockSettlesRun({
      outcome: 'blocked',
      blockedContext: { reasonCodes: [DECLARED], visibleText: '   ' },
    })).toBe(false);
    expect(agentDeclaredBlockSettlesRun({
      outcome: 'blocked',
      blockedContext: { reasonCodes: [DECLARED], visibleText: null },
    })).toBe(false);
  });

  it('is inert for anything that is not a blocked verdict', () => {
    expect(agentDeclaredBlockSettlesRun(null)).toBe(false);
    expect(agentDeclaredBlockSettlesRun(undefined)).toBe(false);
    expect(agentDeclaredBlockSettlesRun({ outcome: 'completed' })).toBe(false);
    expect(agentDeclaredBlockSettlesRun({ outcome: 'blocked' })).toBe(false);
    expect(agentDeclaredBlockSettlesRun({ outcome: 'blocked', blockedContext: null })).toBe(false);
  });
});
