/**
 * Venice chat completions provider. Wire-compatible with OpenAI's
 * /v1/chat/completions (Bearer auth, SSE delta frames + [DONE]) — Venice
 * advertises itself as "OpenAI-compatible inference API supporting text,
 * image, audio, and video generation" (docs.venice.ai/api-reference/api-spec).
 *
 * Routes through the daemon proxy at /api/proxy/venice/stream so:
 *   1. The browser doesn't have to handle CORS against api.venice.ai.
 *   2. The daemon can inject the `generate_image` / `generate_video` /
 *      `generate_speech` tool definitions and dispatch them against Venice's
 *      own /image/generate, /video/queue, and /audio/speech endpoints with
 *      the same BYOK key.
 * The key never leaves the user's machine — same model as the SenseAudio
 * provider.
 */
import type { AppConfig, ChatMessage } from '../types';
import type { StreamHandlers } from './anthropic';
import { streamProxyEndpoint, type ProxyContext } from './api-proxy';

export async function streamMessageVenice(
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  context?: ProxyContext,
): Promise<void> {
  return streamProxyEndpoint(
    '/api/proxy/venice/stream',
    cfg,
    system,
    history,
    signal,
    handlers,
    context,
  );
}
