import type { AppConfig, ChatMessage } from '../types';
import type { StreamHandlers } from './anthropic';
import { streamProxyEndpoint } from './api-proxy';

export async function streamMessageAnthropicProxy(
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
): Promise<void> {
  return streamProxyEndpoint('/api/proxy/anthropic/stream', cfg, system, history, signal, handlers);
}
