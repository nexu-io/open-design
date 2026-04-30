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
import type { AppConfig, ChatMessage } from '../types';
import { isOpenAICompatible, streamMessageOpenAI } from './openai-compatible';

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
): Promise<void> {
  // Route to OpenAI-compatible provider for non-Anthropic models.
  if (isOpenAICompatible(cfg.model, cfg.baseUrl)) {
    return streamMessageOpenAI(cfg, system, history, signal, handlers);
  }

  if (!cfg.apiKey) {
    handlers.onError(new Error('Missing API key — open Settings and paste one in.'));
    return;
  }

  const client = makeClient(cfg);
  let acc = '';

  try {
    const stream = client.messages.stream(
      {
        model: cfg.model,
        max_tokens: 8192,
        system,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
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
