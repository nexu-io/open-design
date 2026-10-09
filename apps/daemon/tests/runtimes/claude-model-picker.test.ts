import { afterEach, describe, expect, it } from 'vitest';
import { claudeAgentDef } from '../../src/runtimes/defs/claude.js';
import { agentCapabilities } from '../../src/runtimes/capabilities.js';
import { isKnownReasoningEffort, mergeFallbackModelMetadata } from '../../src/runtimes/models.js';

afterEach(() => agentCapabilities.delete('claude'));

describe('Claude model and effort selection', () => {
  it('offers Haiku 5.5 with all supported effort levels', () => {
    const model = claudeAgentDef.fallbackModels.find((entry) => entry.id === 'claude-haiku-5-5');
    expect(model?.label).toBe('Haiku 5.5');
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
      expect(isKnownReasoningEffort(claudeAgentDef, 'claude-haiku-5-5', effort)).toBe(true);
    }
  });

  it.each(['low', 'medium', 'high', 'xhigh', 'max'])('forwards %s to Claude with the explicit model', (reasoning) => {
    const args = claudeAgentDef.buildArgs('', [], [], { model: 'claude-haiku-5-5', reasoning });
    expect(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2)).toEqual(['--model', 'claude-haiku-5-5']);
    expect(args.slice(args.indexOf('--effort'), args.indexOf('--effort') + 2)).toEqual(['--effort', reasoning]);
  });

  it('preserves Claude settings when effort is inherited', () => {
    for (const reasoning of [undefined, 'default']) {
      expect(claudeAgentDef.buildArgs('', [], [], {
        model: 'haiku', ...(reasoning === undefined ? {} : { reasoning }),
      })).not.toContain('--effort');
    }
    expect(claudeAgentDef.buildArgs('', [], [], { model: 'default', reasoning: 'default' })).not.toContain('--model');
  });

  it('keeps unsupported effort levels out of older model choices', () => {
    expect(isKnownReasoningEffort(claudeAgentDef, 'claude-haiku-4-5', 'high')).toBe(false);
    expect(isKnownReasoningEffort(claudeAgentDef, 'claude-sonnet-4-6', 'high')).toBe(true);
    expect(isKnownReasoningEffort(claudeAgentDef, 'claude-sonnet-4-6', 'xhigh')).toBe(false);
    expect(isKnownReasoningEffort(claudeAgentDef, 'claude-haiku-5-5', '--bad-flag')).toBe(false);
  });

  it('preserves effort metadata when a proxy route supplies the current model', () => {
    const [model] = mergeFallbackModelMetadata(claudeAgentDef, [{ id: 'claude-haiku-5-5', label: 'Proxy Haiku' }]);
    expect(model?.reasoningOptions?.some((option) => option.id === 'max')).toBe(true);
  });

  it('rejects explicit effort when the installed CLI does not advertise it', () => {
    agentCapabilities.set('claude', { effort: false });
    expect(() => claudeAgentDef.buildArgs('', [], [], { model: 'haiku', reasoning: 'high' })).toThrow(/--effort/);
  });
});
