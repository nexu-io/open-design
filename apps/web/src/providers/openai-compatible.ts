/**
 * OpenAI-compatible API provider. Works with any service that exposes the
 * /v1/chat/completions endpoint (e.g. Z.AI, BigModel, MiMo, DeepSeek, etc.).
 *
 * Routes through the daemon proxy to avoid browser CORS issues.
 * BYOK — the key stays on the user's machine.
 */
import { effectiveMaxTokens } from '../state/maxTokens';
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
    const resp = await fetch('/api/proxy/openai/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
        systemPrompt: system,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        maxTokens: effectiveMaxTokens(cfg),
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

        if (parsed.event === 'delta' || parsed.event === 'message') {
          const text = extractOpenAIText(parsed.data);
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
  if (u.includes('api.z.ai/api/paas') || u.includes('api.z.ai/api/coding/paas')) return true;
  if (u.includes('open.bigmodel.cn/api/paas') || u.includes('open.bigmodel.cn/api/coding/paas')) return true;
  if (u.includes('openrouter')) return true;
  if (u.includes('openai.com')) return true;
  if (m.startsWith('deepseek')) return true;
  if (m.startsWith('glm-')) return true;
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

function extractOpenAIText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const record = data as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = choices[0];
  if (!first || typeof first !== 'object') {
    return typeof record.text === 'string' ? record.text : '';
  }

  const choice = first as Record<string, unknown>;
  const delta = choice.delta;
  if (delta && typeof delta === 'object') {
    const deltaRecord = delta as Record<string, unknown>;
    if (typeof deltaRecord.content === 'string') return deltaRecord.content;
    if (typeof deltaRecord.reasoning_content === 'string') return deltaRecord.reasoning_content;
  }

  const message = choice.message;
  if (message && typeof message === 'object') {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === 'string') return content;
  }

  return '';
}
