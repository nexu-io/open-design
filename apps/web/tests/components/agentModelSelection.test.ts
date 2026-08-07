import { describe, expect, it } from 'vitest';
import {
  agentModelIsSelectable,
  defaultAgentModelId,
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

  it('preserves explicit AMR default choices instead of normalizing them to a concrete fallback', () => {
    const choice = {
      model: 'default',
      reasoning: 'default',
    };

    expect(normalizeAgentModelChoice(amrAgent, choice)).toBeNull();
    expect(effectiveAgentModelChoice(amrAgent, choice)).toEqual(choice);
  });

  it('does not select a disabled model as the AMR default when every catalog row is locked', () => {
    const lockedAmrAgent: AgentInfo = {
      ...amrAgent,
      models: [
        { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', enabled: false },
        { id: 'kimi-k2.6', label: 'Kimi K2.6', enabled: false, default: true },
      ],
    };

    expect(defaultAgentModelId(lockedAmrAgent)).toBeNull();
    expect(effectiveAgentModelChoice(lockedAmrAgent, undefined)).toBeUndefined();
  });

  // `agentModelIsSelectable` is the gate every model-list surface asks before
  // offering a row. It is deliberately the exact complement of
  // `normalizeAgentModelChoice`: offering a model normalization would coerce
  // away means the click is written and then reverted, which the user reads as
  // "the picker ignored me".
  describe('agentModelIsSelectable', () => {
    const planGatedAmr: AgentInfo = {
      ...amrAgent,
      models: [
        { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash', enabled: true, default: true },
        { id: 'claude-opus-4.6', label: 'claude-opus-4.6', enabled: false },
      ],
    };

    it('refuses a model the caller\'s plan does not include', () => {
      expect(agentModelIsSelectable(planGatedAmr, 'claude-opus-4.6')).toBe(false);
      expect(
        normalizeAgentModelChoice(planGatedAmr, { model: 'claude-opus-4.6' }),
      ).not.toBeNull();
    });

    it('allows every on-plan model, plus the default sentinel', () => {
      expect(agentModelIsSelectable(planGatedAmr, 'deepseek-v4-flash')).toBe(true);
      expect(agentModelIsSelectable(planGatedAmr, 'default')).toBe(true);
    });

    it('still refuses every model when the whole catalog is above the plan', () => {
      // A caller entitled to nothing must be routed to an upgrade, not handed a
      // pick the gateway would reject on the next run.
      const allLocked: AgentInfo = {
        ...amrAgent,
        models: [
          { id: 'claude-opus-4.6', label: 'claude-opus-4.6', enabled: false },
          { id: 'claude-opus-4.8', label: 'claude-opus-4.8', enabled: false },
        ],
      };
      expect(agentModelIsSelectable(allLocked, 'claude-opus-4.6')).toBe(false);
    });

    it('refuses an AMR id that is not in the catalog at all', () => {
      expect(agentModelIsSelectable(planGatedAmr, 'gpt-5.4-mini')).toBe(false);
    });

    it('allows anything while the AMR catalog has not loaded', () => {
      expect(agentModelIsSelectable({ id: 'amr', models: [] }, 'anything')).toBe(true);
    });

    it('allows non-AMR agents anything, including custom ids', () => {
      expect(agentModelIsSelectable(codexAgent, 'custom-codex-model')).toBe(true);
    });

    it('refuses an empty model id', () => {
      expect(agentModelIsSelectable(planGatedAmr, '')).toBe(false);
      expect(agentModelIsSelectable(planGatedAmr, null)).toBe(false);
    });

    // The load-bearing relation. A surface that offers only selectable rows can
    // never offer a pick `normalizeAgentModelChoice` would coerce away, so the
    // silent-revert failure mode is unreachable — that is what makes gating on
    // this predicate sufficient rather than merely well-intentioned.
    it('is at least as strict as normalizeAgentModelChoice', () => {
      const catalogs: AgentInfo[] = [
        planGatedAmr,
        amrAgent,
        codexAgent,
        {
          ...amrAgent,
          models: [
            { id: 'claude-opus-4.6', label: 'claude-opus-4.6', enabled: false },
            { id: 'claude-opus-4.8', label: 'claude-opus-4.8', enabled: false },
          ],
        },
        { ...amrAgent, models: [] },
      ];
      const probeIds = [
        'default',
        'glm-5',
        'glm-5.1',
        'deepseek-v4-flash',
        'claude-opus-4.6',
        'claude-opus-4.8',
        'gpt-5.4-mini',
      ];
      for (const agent of catalogs) {
        for (const id of probeIds) {
          const coerced = normalizeAgentModelChoice(agent, { model: id }) !== null;
          if (coerced) {
            expect(
              agentModelIsSelectable(agent, id),
              `${agent.id}/${id} would be coerced away, so it must not be offered`,
            ).toBe(false);
          }
        }
      }
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
