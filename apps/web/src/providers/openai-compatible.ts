/**
 * OpenAI-compatible API provider. Works with any service that exposes the
 * /v1/chat/completions endpoint (e.g. MiMo, DeepSeek, Groq, Together, etc.).
 *
 * Routes through the daemon proxy to avoid browser CORS issues.
 * BYOK — the key stays on the user's machine.
 */
import type { AppConfig, ChatMessage } from '../types';
import type { StreamHandlers } from './anthropic';
import { parseSseFrame } from './sse';

export async function streamMessageOpenAI(
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
): Promise<void> {
  if (!cfg.apiKey) {
    handlers.onError(new Error('Missing API key — open Settings and paste one in.'));
    return;
  }

  let acc = '';

  try {
    const resp = await fetch('/api/proxy/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
        systemPrompt: system,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      }),
      signal,
    });

    if (!resp.ok || !resp.body) {
      const text = await resp.text().catch(() => '');
      handlers.onError(new Error(`proxy ${resp.status}: ${text || 'no body'}`));
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);

        const parsed = parseSseFrame(frame);
        if (!parsed || parsed.kind !== 'event') continue;

        if (parsed.event === 'delta') {
          const text = String(parsed.data.text ?? '');
          if (text) {
            acc += text;
            handlers.onDelta(text);
          }
          continue;
        }

        if (parsed.event === 'error') {
          handlers.onError(new Error(String(parsed.data.message ?? 'proxy error')));
          return;
        }

        if (parsed.event === 'end') {
          handlers.onDone(acc);
          return;
        }
      }
    }

    handlers.onDone(acc);
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    handlers.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 * Detect whether a model ID / base URL should use the OpenAI-compatible
 * provider rather than the Anthropic SDK.
 */
export function isOpenAICompatible(model: string, baseUrl: string): boolean {
  const m = model.toLowerCase();
  const u = baseUrl.toLowerCase();
  // MiMo
  if (m.startsWith('mimo')) return true;
  if (u.includes('xiaomimimo.com/v1')) return true;
  // DeepSeek
  if (m.startsWith('deepseek')) return true;
  if (u.includes('api.deepseek')) return true;
  // Groq / Llama / Mixtral
  if (m.startsWith('groq') || m.startsWith('llama') || m.startsWith('mixtral')) return true;
  if (u.includes('api.groq')) return true;
  // Together
  if (u.includes('api.together')) return true;
  // OpenRouter
  if (u.includes('openrouter')) return true;
  // OpenAI direct
  if (u.includes('openai.com')) return true;
  // Known non-Anthropic model prefixes — route to OpenAI-compatible.
  if (m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return true;
  // If the base URL is NOT the Anthropic default, assume OpenAI-compatible
  // as the safe fallback for third-party providers.
  if (u && !u.includes('anthropic')) return true;
  return false;
}
