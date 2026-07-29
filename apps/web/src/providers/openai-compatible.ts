/**
 * OpenAI-compatible API provider. Works with any service that exposes the
 * /v1/chat/completions endpoint (e.g. MiMo, DeepSeek, Groq, Together, etc.).
 *
 * Routes through the daemon proxy to avoid browser CORS issues.
 * BYOK — the key stays on the user's machine.
 */
import type { AppConfig, ChatMessage } from '../types';
import type { StreamHandlers } from './anthropic';
import { streamProxyEndpoint } from './api-proxy';

export async function streamMessageOpenAI(
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
): Promise<void> {
  return streamProxyEndpoint('/api/proxy/openai/stream', cfg, system, history, signal, handlers);
}

/**
 * Detect whether a model ID / base URL should use the OpenAI-compatible
 * provider rather than the Anthropic SDK.
 */
export function isOpenAICompatible(model: string, baseUrl: string): boolean {
  const m = model.toLowerCase();
  const u = baseUrl.toLowerCase();
  const parsed = new URL(u || 'https://api.anthropic.com', 'https://local.invalid');
  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  const isOfficialAnthropic = parsed.hostname === 'api.anthropic.com';
  const isAnthropicEndpoint = pathSegments.at(-1) === 'anthropic' || (
    /^v\d+$/.test(pathSegments.at(-1) ?? '') && pathSegments.at(-2) === 'anthropic'
  );

  // Anthropic endpoint paths should win for providers that expose both
  // protocol shapes on the same host, e.g. /v1/anthropic or /anthropic/v1.
  if (isAnthropicEndpoint) return false;

  // Explicit OpenAI-compatible providers/models should win even when a host or
  // unrelated path segment happens to contain the word "anthropic".
  if (u.includes('xiaomimimo.com/v1')) return true;
  if (u.includes('api.minimaxi.com/v1')) return true;
  if (u.includes('api.deepseek')) return true;
  if (u.includes('api.groq')) return true;
  if (u.includes('api.together')) return true;
  if (u.includes('openrouter')) return true;
  if (u.includes('openai.com')) return true;
  if (m.startsWith('deepseek')) return true;
  if (m.startsWith('groq') || m.startsWith('llama') || m.startsWith('mixtral')) return true;
  if (m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return true;

  // MiMo exposes both OpenAI-compatible (/v1) and Anthropic-compatible
  // (/anthropic) endpoints with the same model names, so path shape must break
  // the tie for this provider.
  if (m.startsWith('mimo')) return true;

  // If the base URL is custom and not clearly Anthropic-compatible, preserve
  // the existing OpenAI-compatible fallback for third-party providers.
  if (u && !isOfficialAnthropic) return true;
  return false;
}
