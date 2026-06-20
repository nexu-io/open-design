import type { AppConfig, ChatMessage } from '../types';
import type { StreamHandlers } from './anthropic';
import { streamProxyEndpoint, type ProxyContext } from './api-proxy';

export async function streamMessageAzure(
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  context?: ProxyContext,
): Promise<void> {
  return streamProxyEndpoint('/api/proxy/azure/stream', cfg, system, history, signal, handlers, context);
}
