import type { AppConfig, ChatMessage } from '../types';
import type { StreamHandlers } from './anthropic';
import type { ProxyContext } from './api-proxy';
import { streamProxyEndpoint } from './api-proxy';

export async function streamMessageAnthropicProxy(
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  context?: ProxyContext,
): Promise<void> {
  return streamProxyEndpoint(
    '/api/proxy/anthropic/stream',
    cfg,
    system,
    history,
    signal,
    handlers,
    context,
  );
}
