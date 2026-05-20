/**
 * SenseAudio chat completions provider. Wire-compatible with OpenAI
 * (POST /v1/chat/completions, Bearer auth, SSE delta frames + [DONE]),
 * so the only thing that differs from streamMessageOpenAI is the
 * daemon proxy endpoint — keeping a dedicated client makes the picker
 * tab → daemon log line → upstream call chain readable end-to-end and
 * leaves room for SenseAudio-specific divergence in the future.
 *
 * Routes through the daemon proxy to avoid browser CORS issues.
 * BYOK — the key stays on the user's machine.
 */
import type { AppConfig, ChatMessage } from '../types';
import type { StreamHandlers } from './anthropic';
import { streamProxyEndpoint, type ProxyContext } from './api-proxy';

export async function streamMessageSenseAudio(
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  context?: ProxyContext,
): Promise<void> {
  return streamProxyEndpoint(
    '/api/proxy/senseaudio/stream',
    cfg,
    system,
    history,
    signal,
    handlers,
    context,
  );
}
