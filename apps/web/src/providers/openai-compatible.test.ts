import { describe, expect, it } from 'vitest';
import { isOpenAICompatible } from './openai-compatible';

describe('isOpenAICompatible', () => {
  it('preserves explicit OpenAI model routing when the URL contains anthropic', () => {
    expect(isOpenAICompatible('gpt-4o', 'https://anthropic-gateway.example.com/v1')).toBe(true);
    expect(isOpenAICompatible('gpt-4o', 'https://api.example.com/anthropic-named/chat/v1')).toBe(true);
  });

  it('routes MiMo Anthropic-compatible endpoints away from OpenAI-compatible chat completions', () => {
    expect(isOpenAICompatible('mimo-v2.5-pro', 'https://token-plan-cn.xiaomimimo.com/anthropic')).toBe(false);
    expect(isOpenAICompatible('mimo-v2.5-pro', 'https://token-plan-cn.xiaomimimo.com/anthropic/v1')).toBe(false);
  });

  it('preserves MiMo OpenAI-compatible endpoint routing', () => {
    expect(isOpenAICompatible('mimo-v2.5-pro', 'https://token-plan-cn.xiaomimimo.com/v1')).toBe(true);
  });

  it('routes MiniMax Anthropic endpoint paths away from OpenAI-compatible chat completions', () => {
    expect(isOpenAICompatible('MiniMax-M2.7-highspeed', 'https://api.minimaxi.com/v1/anthropic')).toBe(false);
    expect(isOpenAICompatible('MiniMax-M2.7-highspeed', 'https://api.minimaxi.com/anthropic/v1')).toBe(false);
  });

  it('lets explicit OpenAI models win when only the host name contains anthropic', () => {
    expect(isOpenAICompatible('gpt-4o', 'https://anthropic-proxy.example.com/v1')).toBe(true);
  });
});
