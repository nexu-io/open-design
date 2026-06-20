import { effectiveMaxTokens } from '../state/maxTokens';
import type { ApiProtocol, AppConfig, ChatMessage } from '../types';
import type {
  ProxyImageContentBlock,
  ProxyMessage,
  ProxyMessageContent,
  ProxyTextContentBlock,
} from '@open-design/contracts';
import { projectFileUrl } from './registry';
import type { StreamHandlers } from './anthropic';
import { parseSseFrame } from './sse';
import { isAnthropicSupportedImagePath } from '../utils/apiProtocol';

type ProxyStreamResult =
  | { kind: 'done'; finishReason: string | null }
  | { kind: 'aborted' }
  | { kind: 'error' };

const TRUNCATED_FINISH_REASONS = new Set([
  'length',
  'max_tokens',
  'MAX_TOKENS',
]);

const PREFILL_CONTINUATION_PROTOCOLS = new Set<ApiProtocol>(['anthropic']);
const MAX_TRUNCATION_CONTINUATIONS = 8;
const EXPLICIT_CONTINUATION_PROMPT = [
  'Continue exactly from where your previous response stopped.',
  'Do not repeat earlier text or add a preamble.',
  'If you were writing an artifact, continue the same artifact and close it normally.',
].join(' ');

/**
 * Optional per-request context that some protocols thread into the
 * proxy body or use to prepare provider-native message payloads:
 *  - `projectId` lets the `generate_image` tool write into the active
 *    project's folder instead of a daemon-global cache, and lets the
 *    Anthropic proxy resolve image attachments into content blocks.
 *  - `byokImageModel` is the user's BYOK Settings default for the
 *    image tool. The LLM can still override per-call via the tool's
 *    `model` arg; this is just the fallback when it omits one.
 * Other protocols ignore unknown body fields, so callers are free to
 * pass this for every protocol.
 */
export interface ProxyContext {
  projectId?: string;
  byokImageModel?: string;
  byokVideoModel?: string;
  byokSpeechModel?: string;
  byokSpeechVoice?: string;
}

export async function streamProxyEndpoint(
  endpoint: string,
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  context?: ProxyContext,
): Promise<void> {
  if (!cfg.apiKey) {
    handlers.onError(new Error('Missing API key — open Settings and paste one in.'));
    return;
  }

  let acc = '';

  try {
    let requestMessages = await buildProxyMessages(endpoint, history, context);
    let continuations = 0;

    while (true) {
      const result = await streamProxyAttempt({
        endpoint,
        cfg,
        system,
        messages: requestMessages,
        signal,
        handlers,
        context,
        onDelta: (text) => {
          acc += text;
          handlers.onDelta(text);
        },
      });

      if (result.kind === 'aborted' || result.kind === 'error') return;
      if (!isTruncatedFinishReason(result.finishReason)) {
        handlers.onDone(acc);
        return;
      }

      if (continuations >= MAX_TRUNCATION_CONTINUATIONS) {
        handlers.onError(new Error('Response was truncated repeatedly before the provider returned a final stop reason.'));
        return;
      }
      continuations += 1;
      requestMessages = buildContinuationMessages(requestMessages, acc, cfg.apiProtocol);
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    handlers.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

export async function buildProxyMessages(
  endpoint: string,
  history: ChatMessage[],
  context?: ProxyContext,
): Promise<ProxyMessage[]> {
  if (!usesAnthropicMessagesPayload(endpoint) || !context?.projectId) {
    return history.map((m) => ({ role: m.role, content: m.content }));
  }

  const out: ProxyMessage[] = [];
  for (const message of history) {
    out.push({
      role: message.role,
      content: await buildAnthropicMessageContent(message, context.projectId),
    });
  }
  return out;
}

function usesAnthropicMessagesPayload(endpoint: string): boolean {
  return endpoint.includes('/api/proxy/anthropic/');
}

async function buildAnthropicMessageContent(
  message: ChatMessage,
  projectId: string,
): Promise<ProxyMessageContent> {
  const imageAttachments = sortAttachmentsByUserOrder(
    (message.attachments ?? []).filter((attachment) => attachment.kind === 'image'),
  );
  if (message.role !== 'user' || imageAttachments.length === 0) {
    return message.content;
  }

  const blocks: Array<ProxyTextContentBlock | ProxyImageContentBlock> = [];
  if (message.content.trim()) {
    blocks.push({ type: 'text', text: message.content });
  }

  for (const attachment of imageAttachments) {
    const block = await readAnthropicImageBlock(projectId, attachment.path);
    if (block) {
      blocks.push(block);
    } else if (isAnthropicSupportedImagePath(attachment.path)) {
      blocks.push({
        type: 'text',
        text: `Attached image could not be sent as native image content: path: ${attachment.path} | name: ${attachment.name}`,
      });
    }
  }

  return blocks.length > 0 ? blocks : message.content;
}

function sortAttachmentsByUserOrder<T extends { order?: number }>(attachments: T[]): T[] {
  return attachments
    .map((attachment, index) => ({ attachment, index }))
    .sort((a, b) => {
      const aOrder = typeof a.attachment.order === 'number' && Number.isFinite(a.attachment.order)
        ? a.attachment.order
        : a.index;
      const bOrder = typeof b.attachment.order === 'number' && Number.isFinite(b.attachment.order)
        ? b.attachment.order
        : b.index;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map((entry) => entry.attachment);
}

async function readAnthropicImageBlock(
  projectId: string,
  path: string,
): Promise<ProxyImageContentBlock | null> {
  try {
    const resp = await fetch(projectFileUrl(projectId, path), { cache: 'no-store' });
    if (!resp.ok) return null;

    const mediaType = supportedAnthropicImageMediaType(
      resp.headers.get('content-type') ?? '',
      path,
    );
    if (!mediaType) return null;

    const bytes = new Uint8Array(await resp.arrayBuffer());
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: bytesToBase64(bytes),
      },
    };
  } catch {
    return null;
  }
}

function supportedAnthropicImageMediaType(
  contentType: string,
  path: string,
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null {
  const normalized = contentType.split(';', 1)[0]?.trim().toLowerCase();
  if (
    normalized === 'image/jpeg' ||
    normalized === 'image/png' ||
    normalized === 'image/gif' ||
    normalized === 'image/webp'
  ) {
    return normalized;
  }
  const lower = path.toLowerCase();
  if (/\.(jpe?g)$/.test(lower)) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += alphabet[(n >> 18) & 63];
    out += alphabet[(n >> 12) & 63];
    out += alphabet[(n >> 6) & 63];
    out += alphabet[n & 63];
  }
  if (i < bytes.length) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const n = (a << 16) | (b << 8);
    out += alphabet[(n >> 18) & 63];
    out += alphabet[(n >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(n >> 6) & 63] : '=';
    out += '=';
  }
  return out;
}

async function streamProxyAttempt({
  endpoint,
  cfg,
  system,
  messages,
  signal,
  handlers,
  context,
  onDelta,
}: {
  endpoint: string;
  cfg: AppConfig;
  system: string;
  messages: ProxyMessage[];
  signal: AbortSignal;
  handlers: StreamHandlers;
  context?: ProxyContext;
  onDelta: (text: string) => void;
}): Promise<ProxyStreamResult> {
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
      systemPrompt: system,
      messages,
      maxTokens: effectiveMaxTokens(cfg),
      apiVersion: cfg.apiVersion,
      ...(context?.projectId ? { projectId: context.projectId } : {}),
      ...(context?.byokImageModel
        ? { byokImageModel: context.byokImageModel }
        : {}),
      ...(context?.byokVideoModel
        ? { byokVideoModel: context.byokVideoModel }
        : {}),
      ...(context?.byokSpeechModel
        ? { byokSpeechModel: context.byokSpeechModel }
        : {}),
      ...(context?.byokSpeechVoice
        ? { byokSpeechVoice: context.byokSpeechVoice }
        : {}),
    }),
    signal,
  });

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '');
    handlers.onError(new Error(`proxy ${resp.status}: ${text || 'no body'}`));
    return { kind: 'error' };
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    while (true) {
      const match = buf.match(/\r?\n\r?\n/);
      if (!match || match.index === undefined) break;
      const frame = buf.slice(0, match.index);
      buf = buf.slice(match.index + match[0]!.length);

      const parsed = parseSseFrame(frame);
      if (!parsed || parsed.kind !== 'event') continue;

      if (parsed.event === 'delta') {
        const text = String(parsed.data.delta ?? parsed.data.text ?? '');
        if (text) {
          onDelta(text);
        }
        continue;
      }

      if (parsed.event === 'error') {
        handlers.onError(new Error(proxyErrorMessage(parsed.data)));
        return { kind: 'error' };
      }

      if (parsed.event === 'end') {
        return { kind: 'done', finishReason: finishReasonFromEndPayload(parsed.data) };
      }
    }
  }

  const tail = buf.trim();
  if (tail) {
    const parsed = parseSseFrame(tail);
    if (parsed?.kind === 'event') {
      if (parsed.event === 'delta') {
        const text = String(parsed.data.delta ?? parsed.data.text ?? '');
        if (text) onDelta(text);
      } else if (parsed.event === 'error') {
        handlers.onError(new Error(proxyErrorMessage(parsed.data)));
        return { kind: 'error' };
      } else if (parsed.event === 'end') {
        return { kind: 'done', finishReason: finishReasonFromEndPayload(parsed.data) };
      }
    }
  }

  return { kind: signal.aborted ? 'aborted' : 'done', finishReason: null };
}

function proxyErrorMessage(data: Record<string, unknown>): string {
  const nested = data.error;
  if (nested && typeof nested === 'object' && 'message' in nested) {
    const message = (nested as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return String(data.message ?? 'proxy error');
}

function finishReasonFromEndPayload(data: Record<string, unknown>): string | null {
  return typeof data.finishReason === 'string' && data.finishReason ? data.finishReason : null;
}

function isTruncatedFinishReason(reason: string | null): boolean {
  return reason !== null && TRUNCATED_FINISH_REASONS.has(reason);
}

function canContinueWithAssistantPrefill(protocol?: ApiProtocol): boolean {
  return protocol !== undefined && PREFILL_CONTINUATION_PROTOCOLS.has(protocol);
}

function buildContinuationMessages(
  messages: ProxyMessage[],
  assistantText: string,
  protocol?: ApiProtocol,
): ProxyMessage[] {
  if (canContinueWithAssistantPrefill(protocol)) {
    return appendContinuationAssistantMessage(messages, assistantText, protocol);
  }
  return appendExplicitContinuationRequest(messages, assistantText, protocol);
}

function appendContinuationAssistantMessage(
  messages: ProxyMessage[],
  assistantText: string,
  protocol?: ApiProtocol,
): ProxyMessage[] {
  const compacted = compactContinuationHistory(messages, protocol);
  const last = compacted[compacted.length - 1];
  if (last?.role === 'assistant') {
    return [
      ...compacted.slice(0, -1),
      { ...last, content: assistantText },
    ];
  }
  return [...compacted, { role: 'assistant', content: assistantText }];
}

function appendExplicitContinuationRequest(
  messages: ProxyMessage[],
  assistantText: string,
  protocol?: ApiProtocol,
): ProxyMessage[] {
  const compacted = compactContinuationHistory(messages, protocol);
  const last = compacted[compacted.length - 1];
  const previous = compacted[compacted.length - 2];
  if (
    last?.role === 'user'
    && last.content === EXPLICIT_CONTINUATION_PROMPT
    && previous?.role === 'assistant'
  ) {
    return [
      ...compacted.slice(0, -2),
      { ...previous, content: assistantText },
      last,
    ];
  }

  if (last?.role === 'assistant') {
    return [
      ...compacted.slice(0, -1),
      { ...last, content: assistantText },
      { role: 'user', content: EXPLICIT_CONTINUATION_PROMPT },
    ];
  }

  return [
    ...compacted,
    { role: 'assistant', content: assistantText },
    { role: 'user', content: EXPLICIT_CONTINUATION_PROMPT },
  ];
}

function compactContinuationHistory(
  messages: ProxyMessage[],
  protocol?: ApiProtocol,
): ProxyMessage[] {
  if (protocol === 'google') return messages;
  const compacted: ProxyMessage[] = [];
  for (const message of messages) {
    const previous = compacted[compacted.length - 1];
    if (previous?.role === message.role) {
      compacted[compacted.length - 1] = {
        ...previous,
        content: mergeProxyMessageContent(previous.content, message.content),
      };
    } else {
      compacted.push(message);
    }
  }
  return compacted;
}

function mergeProxyMessageContent(
  previous: ProxyMessageContent,
  next: ProxyMessageContent,
): ProxyMessageContent {
  if (typeof previous === 'string' && typeof next === 'string') {
    return `${previous}\n\n${next}`;
  }

  const previousBlocks = proxyContentBlocks(previous);
  const nextBlocks = proxyContentBlocks(next);
  return [
    ...previousBlocks,
    ...(previousBlocks.length > 0 && nextBlocks.length > 0
      ? [{ type: 'text' as const, text: '\n\n' }]
      : []),
    ...nextBlocks,
  ];
}

function proxyContentBlocks(
  content: ProxyMessageContent,
): Array<ProxyTextContentBlock | ProxyImageContentBlock> {
  if (Array.isArray(content)) return content;
  return content ? [{ type: 'text', text: content }] : [];
}
