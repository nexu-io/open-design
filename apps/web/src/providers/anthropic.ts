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
import { effectiveMaxTokens } from '../state/maxTokens';
import type { AppConfig, ChatMessage } from '../types';
import { streamMessageAnthropicProxy } from './anthropic-compatible';
import { streamMessageAzure } from './azure-compatible';
import { streamMessageGoogle } from './google-compatible';
import { isOpenAICompatible, streamMessageOpenAI } from './openai-compatible';

// Re-export for convenience
export { isOpenAICompatible } from './openai-compatible';

export interface StreamHandlers {
  onDelta: (textDelta: string) => void;
  onDone: (fullText: string) => void;
  onError: (err: Error) => void;
  onToolCall?: (call: { name: string; parameters: Record<string, unknown> }) => void;
  onToolResult?: (result: { name: string; content: string; isError: boolean }) => void;
  onUsage?: (usage: { inputTokens?: number; outputTokens?: number }) => void;
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
  // Prefer the explicit Settings protocol; keep the legacy heuristic as a
  // fallback for configs saved before apiProtocol existed.
  if (cfg.apiProtocol === 'azure') {
    return streamMessageAzure(cfg, system, history, signal, handlers);
  }
  if (cfg.apiProtocol === 'google') {
    return streamMessageGoogle(cfg, system, history, signal, handlers);
  }
  if (cfg.apiProtocol === 'openai' || (!cfg.apiProtocol && isOpenAICompatible(cfg.model, cfg.baseUrl))) {
    return streamMessageOpenAI(cfg, system, history, signal, handlers);
  }

  if (cfg.baseUrl && cfg.baseUrl !== 'https://api.anthropic.com') {
    return streamMessageAnthropicProxy(cfg, system, history, signal, handlers);
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
        max_tokens: effectiveMaxTokens(cfg),
        system,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      },
      { signal },
    );

    stream.on('text', (delta) => {
      acc += delta;
      handlers.onDelta(delta);
    });

    const final = await stream.finalMessage();
    // Extract usage for token visualization
    const usage = final.usage;
    if (usage && handlers.onUsage) {
      handlers.onUsage({
        inputTokens: usage.input_tokens ?? undefined,
        outputTokens: usage.output_tokens ?? undefined,
      });
    }
    if (final.stop_reason === 'max_tokens' || final.stop_reason === 'length') {
      handlers.onError(new Error(
        `Response truncated (stop_reason=${final.stop_reason}). The output hit the token limit. ` +
        `Try increasing max_tokens in Settings or reducing the prompt length.`
      ));
      return;
    }
    handlers.onDone(acc);
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    handlers.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// Agent loop: wraps streamMessage with tool-call parsing and execution.
// When the model emits <tool_call> blocks (DeepSeek XML format), this
// function extracts them, executes the corresponding tools via the daemon,
// appends <tool_result> blocks to the conversation, and loops.
//
// Max 25 tool-call rounds. The loop stops when the model produces a
// response with no tool calls, or when cancelled.

export interface ToolLoopContext {
  projectId: string;
  baseUrl: string;
}

export async function streamMessageWithAgentLoop(
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  toolCtx: ToolLoopContext,
): Promise<void> {
  const MAX_ROUNDS = 25;
  let round = 0;
  let fullAcc = '';

  // Lazy-import parser + executor so the browser bundle doesn't bloat
  // when this path isn't exercised.
  const [
    { parseToolCalls },
    { executeToolCalls, formatToolResultsAsXml },
  ] = await Promise.all([
    import('./tool-call-parser'),
    import('./tool-executor'),
  ]);

  while (round < MAX_ROUNDS) {
    if (signal.aborted) return;

    let acc = '';
    let toolCallsFound = false;

    const roundHandlers: StreamHandlers = {
      onDelta: (delta) => {
        acc += delta;
        handlers.onDelta(delta);
      },
      onDone: (text: string) => {
        acc = text;
      },
      onError: (err: Error) => {
        throw err;
      },
      onUsage: handlers.onUsage,
    };

    try {
      await new Promise<void>((resolve, reject) => {
        roundHandlers.onError = (err) => reject(err);
        const origDone = roundHandlers.onDone;
        roundHandlers.onDone = (text: string) => {
          acc = text;
          resolve();
        };

        void streamMessage(cfg, system, history, signal, roundHandlers).catch(reject);
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      handlers.onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    if (signal.aborted) return;

    const { toolCalls, cleanText } = parseToolCalls(acc);

    if (toolCalls.length === 0) {
      fullAcc += acc;
      handlers.onDone(fullAcc);
      return;
    }

    // Append the clean text (without tool call XML) for display
    fullAcc += cleanText + '\n\n';

    // Add the full assistant response (with tool calls) to history for context
    const assistantMsg: ChatMessage = {
      id: `assistant-${round}-${Date.now()}`,
      role: 'assistant' as const,
      content: acc,
    };
    history = [...history, assistantMsg];

    // Execute tools
    for (const call of toolCalls) {
      if (signal.aborted) return;
      handlers.onToolCall?.({ name: call.name, parameters: call.parameters });
    }

    const results = await executeToolCalls(
      toolCalls,
      toolCtx.baseUrl,
      toolCtx.projectId,
    );

    for (const r of results) {
      handlers.onToolResult?.({ name: r.name, content: r.content, isError: r.isError });
    }

    // Append tool results to history for the next API round.
    // Cap each result block to prevent binary-file reads or huge stderr
    // dumps from blowing out the next API call.
    const MAX_RESULT_CHARS = 50_000;
    let toolResultXml = formatToolResultsAsXml(results);
    if (toolResultXml.length > MAX_RESULT_CHARS) {
      toolResultXml =
        toolResultXml.slice(0, MAX_RESULT_CHARS) +
        `\n... (tool result truncated at ${MAX_RESULT_CHARS} / ${toolResultXml.length} chars)`;
    }
    const toolResultMsg: ChatMessage = {
      id: `tool-result-${round}-${Date.now()}`,
      role: 'user' as const,
      content: toolResultXml,
    };
    history = [...history, toolResultMsg];

    round += 1;
  }

  // Exhausted max rounds — report what we have
  handlers.onDone(fullAcc);
}
