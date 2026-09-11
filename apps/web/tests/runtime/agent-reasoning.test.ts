import { describe, expect, it } from 'vitest';
import { reconcileAgentChoice, reconcileAgentPreferences, reasoningOptionsForModel } from '../../src/runtime/agent-reasoning';
import { DEFAULT_CONFIG } from '../../src/state/config';
import type { AgentInfo } from '../../src/types';

const agent: AgentInfo = {
  id: 'codex', bin: 'codex', name: 'Codex', available: true,
  reasoningOptions: [{ id: 'default', label: 'Default' }, { id: 'minimal', label: 'Minimal' }],
  models: [
    { id: 'sol', label: 'Sol', reasoningOptions: [{ id: 'ultra', label: 'Ultra' }] },
    { id: 'luna', label: 'Luna', reasoningOptions: [{ id: 'max', label: 'Max' }] },
    { id: 'empty', label: 'Empty', reasoningOptions: [] },
    { id: 'legacy', label: 'Legacy' },
  ],
};
describe('saved model reasoning', () => {
  it('resets unsupported choices on model switch and retains supported choices', () => {
    expect(reconcileAgentChoice(agent, { model: 'sol', reasoning: 'ultra' }, { model: 'luna' }))
      .toEqual({ model: 'luna', reasoning: 'default' });
    expect(reconcileAgentChoice(agent, { model: 'sol', reasoning: 'ultra' }, { model: 'sol' }).reasoning).toBe('ultra');
    expect(reconcileAgentChoice(agent, { model: 'legacy', reasoning: 'minimal' }).reasoning).toBe('minimal');
  });
  it('repairs stale loaded preferences and returns the same config after repair', () => {
    const config = { ...DEFAULT_CONFIG, agentModels: { codex: { model: 'luna', reasoning: 'ultra' } } };
    const repaired = reconcileAgentPreferences(config, [agent]);
    expect(repaired.agentModels?.codex?.reasoning).toBe('default');
    expect(reconcileAgentPreferences(repaired, [agent])).toBe(repaired);
    expect(config.agentModels.codex.reasoning).toBe('ultra');
  });
  it('uses fallback only for absent metadata and always offers Default for model metadata', () => {
    expect(reasoningOptionsForModel(agent, 'empty').map((r) => r.id)).toEqual(['default']);
    expect(reasoningOptionsForModel(agent, 'legacy')).toEqual(agent.reasoningOptions);
    expect(reasoningOptionsForModel(agent, 'custom')).toEqual(agent.reasoningOptions);
  });
});
