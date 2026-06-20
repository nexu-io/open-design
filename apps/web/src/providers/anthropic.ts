/**
 * Thin wrapper over @anthropic-ai/sdk. Minimal analog of
 * packages/providers/src/index.ts in the reference repo.
 *
 * Runs in the browser with dangerouslyAllowBrowser — this is a BYOK local-
 * first tool, so the key is the user's and never leaves their machine. If
 * you later move to a server-hosted build, drop that flag and proxy through
 * your own backend.
 */
import Anthropic from '@anthropic-ai/sdk';
import { effectiveMaxTokens } from '../state/maxTokens';
import type { AppConfig, ChatMessage } from '../types';
import { streamMessageAnthropicProxy } from './anthropic-compatible';
import {
  buildAnthropicMessageContent,
  type AnthropicMessageContent,
  type ProxyContext,
} from './api-proxy';
import { streamMessageAzure } from './azure-compatible';
import { streamMessageGoogle } from './google-compatible';
import { streamMessageOllama } from './ollama-compatible';
import { isOpenAICompatible, streamMessageOpenAI } from './openai-compatible';
import { streamMessageSenseAudio } from './senseaudio-compatible';
import { streamMessageAIHubMix } from './aihubmix-compatible';
import { usesAnthropicProxy } from '../utils/apiProtocol';

// Re-export for convenience
export { isOpenAICompatible } from './openai-compatible';

export interface StreamHandlers {
  onDelta: (textDelta: string) => void;
  onDone: (fullText: string) => void;
  onError: (err: Error) => void;
}

export function makeClient(cfg: AppConfig): Anthropic {
  return new Anthropic({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl || undefined,
    dangerouslyAllowBrowser: true,
  });
}

export async function streamMessage(
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  context?: ProxyContext,
): Promise<void> {
  // Prefer the explicit Settings protocol; keep the legacy heuristic as a
  // fallback for configs saved before apiProtocol existed.
  if (cfg.apiProtocol === 'azure') {
    return streamMessageAzure(cfg, system, history, signal, handlers, context);
  }
  if (cfg.apiProtocol === 'ollama') {
    return streamMessageOllama(cfg, system, history, signal, handlers);
  }
  if (cfg.apiProtocol === 'google') {
    return streamMessageGoogle(cfg, system, history, signal, handlers);
  }
  if (cfg.apiProtocol === 'senseaudio') {
    return streamMessageSenseAudio(cfg, system, history, signal, handlers, context);
  }
  if (cfg.apiProtocol === 'aihubmix') {
    return streamMessageAIHubMix(cfg, system, history, signal, handlers, context);
  }
  if (cfg.apiProtocol === 'openai' || (!cfg.apiProtocol && isOpenAICompatible(cfg.model, cfg.baseUrl))) {
    return streamMessageOpenAI(cfg, system, history, signal, handlers, context);
  }

  if (usesAnthropicProxy(cfg)) {
    return streamMessageAnthropicProxy(cfg, system, history, signal, handlers, context);
  }

  if (!cfg.apiKey) {
    handlers.onError(new Error('Missing API key — open Settings and paste one in.'));
    return;
  }

  const client = makeClient(cfg);
  let acc = '';

  try {
    const messages = await buildNativeAnthropicMessages(history, context);
    const stream = client.messages.stream(
      {
        model: cfg.model,
        max_tokens: effectiveMaxTokens(cfg),
        system,
        messages,
      },
      { signal },
    );

    stream.on('text', (delta) => {
      acc += delta;
      handlers.onDelta(delta);
    });

    await stream.finalMessage();
    handlers.onDone(acc);
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    handlers.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

async function buildNativeAnthropicMessages(
  history: ChatMessage[],
  context?: ProxyContext,
): Promise<Array<{ role: 'user' | 'assistant'; content: AnthropicMessageContent }>> {
  const messages: Array<{ role: 'user' | 'assistant'; content: AnthropicMessageContent }> = [];
  for (const message of history) {
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    messages.push({
      role: message.role,
      content: context?.projectId
        ? await buildAnthropicMessageContent(message, context.projectId)
        : message.content,
    });
  }
  return messages;
}
