import type { AppConfig, ChatMessage } from '../types';
import { streamMessage, type StreamHandlers } from '../providers/anthropic';
import { buildGenerationSystemPrompt, buildGenerationUserPrompt, extractJsonPayload } from './prompts';
import { mergeGeneratedSegments, validateGeneratedSegments } from './merge';
import type { GenerationKind, ProductionSegment } from './types';
import type { TextGenerationAdapter, TextGenerationAdapterRunInput } from './adapters';

export interface RunProductionGenerationInput {
  kind: GenerationKind;
  config: AppConfig;
  segments: ProductionSegment[];
  voiceTone: string;
  defaultVoiceProfileId: string;
  knownVoiceProfileIds: readonly string[];
  resolveVoiceLabel: (voiceProfileId: string) => string;
  streamMessageImpl?: typeof streamMessage;
  timeoutMs?: number;
}

export interface RunProductionGenerationResult {
  segments: ProductionSegment[];
  notice: string;
}

export interface RunProductionGenerationOptions extends RunProductionGenerationInput {
  adapter?: TextGenerationAdapter;
}

const DEFAULT_TIMEOUT_MS = 120_000;

function generationNotice(kind: GenerationKind): string {
  return kind === 'draft'
    ? 'Draft updated from OpenRouter.'
    : kind === 'voice'
      ? 'Voice lanes updated from OpenRouter.'
      : 'Storyboard lanes updated from OpenRouter.';
}

function isRetryableStreamError(error: Error): boolean {
  return /fetch failed|network|timeout|aborted|ECONNRESET|ETIMEDOUT/i.test(error.message);
}

async function runOpenRouterProductionGeneration(
  input: RunProductionGenerationInput,
): Promise<RunProductionGenerationResult> {
  const trimmedBaseUrl = input.config.baseUrl.trim();
  const trimmedApiKey = input.config.apiKey.trim();
  const trimmedModel = input.config.model.trim();

  if (input.config.mode !== 'api') {
    return {
      segments: input.segments,
      notice: 'Switch Settings to API mode with OpenRouter before generating.',
    };
  }
  if (!trimmedBaseUrl || !trimmedApiKey || !trimmedModel) {
    return {
      segments: input.segments,
      notice: 'Set OpenRouter base URL, API key, and model first.',
    };
  }

  const stream = input.streamMessageImpl ?? streamMessage;
  const maxAttempts = 2;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const history: ChatMessage[] = [
    {
      id: `production-generation-${input.kind}`,
      role: 'user',
      content: buildGenerationUserPrompt(input.kind, input.segments, input.voiceTone),
      createdAt: Date.now(),
    },
  ];

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    const buffer: string[] = [];
    let streamError: Error | null = null;
    let completed = false;

    const handlers: StreamHandlers = {
      onDelta: (delta) => buffer.push(delta),
      onDone: () => {
        completed = true;
      },
      onError: (err) => {
        streamError = err;
      },
    };

    try {
      await stream(
        {
          ...input.config,
          model: trimmedModel,
          baseUrl: trimmedBaseUrl,
          apiKey: trimmedApiKey,
        },
        buildGenerationSystemPrompt(input.kind),
        history,
        controller.signal,
        handlers,
      );
    } finally {
      globalThis.clearTimeout(timeout);
    }

    if (controller.signal.aborted && !completed && !streamError) {
      streamError = new Error('Production generation timed out.');
    }

    if (streamError) {
      lastError = streamError;
      if (attempt === 0 && isRetryableStreamError(streamError)) {
        continue;
      }
      return {
        segments: input.segments,
        notice: streamError.message,
      };
    }

    const payload = extractJsonPayload(buffer.join(''));
    if (!payload?.segments?.length) {
      return {
        segments: input.segments,
        notice: 'Generation finished, but the response was not valid JSON.',
      };
    }

    try {
      validateGeneratedSegments(payload, input.knownVoiceProfileIds);
    } catch (error) {
      return {
        segments: input.segments,
        notice: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      segments: mergeGeneratedSegments(
        input.segments,
        payload.segments,
        input.kind,
        input.voiceTone,
        input.defaultVoiceProfileId,
        input.resolveVoiceLabel,
      ),
      notice: generationNotice(input.kind),
    };
  }

  return {
    segments: input.segments,
    notice: lastError?.message ?? 'Generation failed.',
  };
}

export const openRouterTextGenerationAdapter: TextGenerationAdapter = {
  name: 'openrouter',
  run: runOpenRouterProductionGeneration,
};

export async function runProductionGeneration(
  input: RunProductionGenerationOptions,
): Promise<RunProductionGenerationResult> {
  const adapter = input.adapter ?? openRouterTextGenerationAdapter;
  const adapterInput: TextGenerationAdapterRunInput = {
    kind: input.kind,
    config: input.config,
    segments: input.segments,
    voiceTone: input.voiceTone,
    defaultVoiceProfileId: input.defaultVoiceProfileId,
    knownVoiceProfileIds: input.knownVoiceProfileIds,
    resolveVoiceLabel: input.resolveVoiceLabel,
    timeoutMs: input.timeoutMs,
    streamMessageImpl: input.streamMessageImpl,
  };
  return adapter.run(adapterInput);
}
