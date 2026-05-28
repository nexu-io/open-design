import { describe, expect, it } from 'vitest';
import {
  effectiveAgentModelChoice,
  normalizeAgentModelChoice,
} from '../../src/components/agentModelSelection';
import type { AgentInfo } from '../../src/types';

const amrAgent: AgentInfo = {
  id: 'amr',
  name: 'AMR',
  bin: 'amr',
  available: true,
  version: '1.0.0',
  models: [
    { id: 'glm-5', label: 'GLM 5' },
    { id: 'glm-5.1', label: 'GLM 5.1' },
  ],
};

const codexAgent: AgentInfo = {
  id: 'codex',
  name: 'Codex',
  bin: 'codex',
  available: true,
  version: '1.0.0',
  models: [{ id: 'default', label: 'Default' }],
};

describe('agent model selection', () => {
  it('normalizes stale saved AMR models to the first live model', () => {
    expect(
      normalizeAgentModelChoice(amrAgent, {
        model: 'gpt-5.4-mini',
        reasoning: 'medium',
      }),
    ).toEqual({
      model: 'glm-5',
      reasoning: 'medium',
    });
  });

  it('submits the same normalized AMR model that the switcher displays', () => {
    expect(
      effectiveAgentModelChoice(amrAgent, {
        model: 'gpt-5.4-mini',
        reasoning: 'medium',
      }),
    ).toEqual({
      model: 'glm-5',
      reasoning: 'medium',
    });
  });

  it('keeps non-AMR custom model choices unchanged', () => {
    expect(
      effectiveAgentModelChoice(codexAgent, {
        model: 'custom-codex-model',
        reasoning: 'high',
      }),
    ).toEqual({
      model: 'custom-codex-model',
      reasoning: 'high',
    });
  });
});
