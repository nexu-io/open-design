import { describe, expect, it } from 'vitest';
import {
  apiProtocolLabel,
  apiProtocolModelLabel,
  supportsNativeImageAttachments,
} from '../../src/utils/apiProtocol';
import {
  agentDisplayName,
  agentModelDisplayName,
  exactAgentDisplayName,
} from '../../src/utils/agentLabels';

describe('api protocol labels', () => {
  it('labels the selected API protocol instead of assuming Anthropic', () => {
    expect(apiProtocolLabel('openai')).toBe('OpenAI API');
    expect(apiProtocolLabel('google')).toBe('Google Gemini');
    expect(apiProtocolLabel(undefined)).toBe('Anthropic API');
  });

  it('includes the selected model when labeling API assistant messages', () => {
    expect(apiProtocolModelLabel('openai', 'google/gemma-4-e4b')).toBe(
      'OpenAI API · google/gemma-4-e4b',
    );
    expect(apiProtocolModelLabel('azure', '  ')).toBe('Azure OpenAI');
  });

  it('enables native image attachment omission for vision-capable BYOK paths', () => {
    const baseConfig = {
      mode: 'api' as const,
      apiKey: 'test-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4',
      agentId: null,
      skillId: null,
      designSystemId: null,
    };

    expect(supportsNativeImageAttachments(baseConfig)).toBe(true);
    expect(supportsNativeImageAttachments({ ...baseConfig, apiProtocol: 'openai', model: 'gpt-5.5' })).toBe(true);
    expect(supportsNativeImageAttachments({ ...baseConfig, apiProtocol: 'azure', model: 'chat-gpt-latest' })).toBe(true);
    expect(supportsNativeImageAttachments({ ...baseConfig, apiProtocol: 'azure', model: 'design-chat-prod' })).toBe(true);
    expect(supportsNativeImageAttachments({ ...baseConfig, apiProtocol: 'openai', model: 'gpt-3.5-turbo' })).toBe(false);
    expect(supportsNativeImageAttachments({ ...baseConfig, apiProtocol: 'google', model: 'gemini-pro' })).toBe(false);
    expect(supportsNativeImageAttachments({
      ...baseConfig,
      baseUrl: 'https://custom-openai-compatible.example/v1',
      model: 'text-only-model',
    })).toBe(false);
  });

  it('includes explicit local CLI models when labeling agent messages', () => {
    expect(agentModelDisplayName('claude', 'Claude Code', 'claude-sonnet-4-6')).toBe(
      'Claude · claude-sonnet-4-6',
    );
    expect(agentModelDisplayName('claude', 'Claude Code', 'default')).toBe('Claude');
  });

  it('normalizes Qoder local CLI ids, aliases, and executable paths', () => {
    expect(agentDisplayName('qoder')).toBe('Qoder');
    expect(exactAgentDisplayName('qodercli')).toBe('Qoder');
    expect(exactAgentDisplayName('Qoder CLI')).toBe('Qoder');
    expect(agentDisplayName('/opt/homebrew/bin/qodercli')).toBe('Qoder');
    expect(agentDisplayName('C:\\Tools\\qodercli.cmd')).toBe('Qoder');
  });

  it('includes explicit Qoder models but hides the default model', () => {
    expect(agentModelDisplayName('qoder', 'Qoder CLI', 'ultimate')).toBe('Qoder · ultimate');
    expect(agentModelDisplayName('qoder', 'Qoder CLI', 'default')).toBe('Qoder');
  });
});
