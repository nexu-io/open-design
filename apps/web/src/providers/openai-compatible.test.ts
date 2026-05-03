import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig, ChatMessage } from '../types';
import { isOpenAICompatible, streamMessageOpenAI } from './openai-compatible';

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('routes Z.AI and BigModel GLM endpoints as OpenAI-compatible', () => {
    expect(isOpenAICompatible('glm-5.1', 'https://api.z.ai/api/paas/v4')).toBe(true);
    expect(isOpenAICompatible('glm-5.1', 'https://api.z.ai/api/coding/paas/v4')).toBe(true);
    expect(isOpenAICompatible('glm-5.1', 'https://open.bigmodel.cn/api/paas/v4')).toBe(true);
    expect(isOpenAICompatible('glm-5.1', 'https://open.bigmodel.cn/api/coding/paas/v4')).toBe(true);
  });

  it('routes MiniMax Anthropic endpoint paths away from OpenAI-compatible chat completions', () => {
    expect(isOpenAICompatible('MiniMax-M2.7-highspeed', 'https://api.minimaxi.com/v1/anthropic')).toBe(false);
    expect(isOpenAICompatible('MiniMax-M2.7-highspeed', 'https://api.minimaxi.com/anthropic/v1')).toBe(false);
  });

  it('lets explicit OpenAI models win when only the host name contains anthropic', () => {
    expect(isOpenAICompatible('gpt-4o', 'https://anthropic-proxy.example.com/v1')).toBe(true);
  });
});

describe('streamMessageOpenAI', () => {
  it('streams OpenAI-compatible deltas through the daemon OpenAI proxy route', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode([
          'event: message',
          'data: {"choices":[{"delta":{"content":"Hello"}}]}',
          '',
          'event: message',
          'data: {"choices":[{"delta":{"content":" world"}}]}',
          '',
          '',
        ].join('\n')));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body });
    vi.stubGlobal('fetch', fetchMock);

    const config: AppConfig = {
      mode: 'api',
      apiKey: 'sk-test',
      apiProtocol: 'openai',
      baseUrl: 'https://api.z.ai/api/paas/v4',
      model: 'glm-5.1',
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    const history: ChatMessage[] = [{ id: 'm1', role: 'user', content: 'Say hello' }];
    const deltas: string[] = [];
    let done = '';

    await streamMessageOpenAI(config, 'System prompt', history, new AbortController().signal, {
      onDelta: (delta) => deltas.push(delta),
      onDone: (text) => {
        done = text;
      },
      onError: (error) => {
        throw error;
      },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/proxy/openai/stream', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
    const payload = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(payload).toMatchObject({
      baseUrl: 'https://api.z.ai/api/paas/v4',
      apiKey: 'sk-test',
      model: 'glm-5.1',
      systemPrompt: 'System prompt',
      messages: [{ role: 'user', content: 'Say hello' }],
    });
    expect(deltas).toEqual(['Hello', ' world']);
    expect(done).toBe('Hello world');
  });
});
