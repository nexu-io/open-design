import { describe, expect, it } from 'vitest';

import { composeOdNextStrategyStableRequestContextV2 } from '../src/prompts/od-next-strategy.js';
import { SUBAGENT_TURN_DIRECTIVE, subagentTurnDirectiveFor } from '../src/prompts/subagent-turn.js';
import { composeSystemPrompt } from '../src/prompts/system.js';

describe('sub-agent turn host contract', () => {
  it.each(['claude', 'codex', undefined])('reaches OD Next runs on %s as a host instruction', (agentId) => {
    const prompt = composeOdNextStrategyStableRequestContextV2({ agentId });
    expect(prompt).toContain('<od-next-context kind="instruction" name="subagent-turn">');
    expect(prompt).toContain(SUBAGENT_TURN_DIRECTIVE);
  });

  it('leaves AMR runs out', () => {
    expect(subagentTurnDirectiveFor('amr')).toBeNull();
    const prompt = composeOdNextStrategyStableRequestContextV2({ agentId: 'amr' });
    expect(prompt).not.toContain('name="subagent-turn"');
    expect(prompt).not.toContain(SUBAGENT_TURN_DIRECTIVE);
  });

  it.each(['design', 'chat', 'plan'] as const)('reaches API/BYOK runs in %s mode', (sessionMode) => {
    expect(composeSystemPrompt({ sessionMode })).toContain(SUBAGENT_TURN_DIRECTIVE);
  });
});
