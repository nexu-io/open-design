import path from 'node:path';

import type { ZcodeSavedProviderSelection } from './zcode-config.js';
import type {
  ZcodeNotificationListener,
  ZcodeProtocolRequest,
  ZcodeProtocolResponse,
} from './zcode-protocol.js';
import { createZcodeStreamHandler } from './zcode-stream.js';

type JsonRecord = Record<string, unknown>;
type ZcodeEvent = Record<string, unknown>;

export type ZcodeProtocolClientLike = {
  onNotification(listener: ZcodeNotificationListener): () => void;
  request(
    request: ZcodeProtocolRequest,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<ZcodeProtocolResponse>;
  respond(id: string, result: JsonRecord): void;
};

export type StartZcodeProtocolTurnOptions = {
  client: ZcodeProtocolClientLike;
  cwd: string;
  deliveryKind?: string;
  mode?: string | null;
  onEvent: (event: ZcodeEvent) => void;
  prompt: string;
  providerSelection: ZcodeSavedProviderSelection;
  requestTimeoutMs?: number;
  resumeSessionId?: string | null;
  signal?: AbortSignal;
  workspaceKey?: string;
};

export type StartedZcodeProtocolTurn = {
  sessionId: string;
  unsubscribe: () => void;
};

const DEFAULT_DELIVERY_KIND = 'desktop-continuous';
const DEFAULT_RUNTIME_PREFERENCES = {
  nativeSearchEnhancementsEnabled: true,
  memoryEnabled: false,
  askUserQuestionAutoResolutionEnabled: true,
  modelContextBudgetStrategy: 'preflight-v1',
} satisfies JsonRecord;

export class ZcodeResumeSessionMissingError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`ZCode resume session is no longer available: ${sessionId}. ${message}`);
    this.name = 'ZcodeResumeSessionMissingError';
    this.sessionId = sessionId;
    this.cause = cause;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resultRecord(response: ZcodeProtocolResponse): JsonRecord {
  return isRecord(response.result) ? response.result : response;
}

function sessionIdFromCreateResponse(response: ZcodeProtocolResponse): string {
  const result = resultRecord(response);
  const session = isRecord(result.session) ? result.session : undefined;
  const sessionId = typeof session?.sessionId === 'string'
    ? session.sessionId
    : typeof result.sessionId === 'string'
      ? result.sessionId
      : null;
  if (!sessionId) {
    throw new Error('zcode session/create did not return a sessionId');
  }
  return sessionId;
}

function isZcodeResumeMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:session|conversation).*(?:not found|missing|expired|gone|unavailable|does not exist)|(?:not found|missing).*(?:session|conversation)/i
    .test(message);
}

function workspaceFor(cwd: string, workspaceKey?: string): JsonRecord {
  return {
    workspacePath: cwd,
    workspaceKey: workspaceKey?.trim() || `od-${path.basename(cwd) || 'workspace'}`,
  };
}

export async function startZcodeProtocolTurn({
  client,
  cwd,
  deliveryKind = DEFAULT_DELIVERY_KIND,
  mode,
  onEvent,
  prompt,
  providerSelection,
  requestTimeoutMs,
  resumeSessionId,
  signal,
  workspaceKey,
}: StartZcodeProtocolTurnOptions): Promise<StartedZcodeProtocolTurn> {
  const stream = createZcodeStreamHandler(onEvent);
  const unsubscribe = client.onNotification((frame) => {
    if (typeof frame.id === 'string') {
      if (frame.method === 'interaction/requestProviderRuntimeHeaders') {
        client.respond(frame.id, { headersApplied: true });
      } else if (frame.method === 'session/requestRuntimePreferences') {
        client.respond(frame.id, DEFAULT_RUNTIME_PREFERENCES);
      }
    }
    stream.handleFrame(frame);
  });

  let requestSeq = 0;
  const request = (method: string, params: JsonRecord) => {
    requestSeq += 1;
    return client.request(
      { id: `zcode-${requestSeq}`, method, params },
      requestTimeoutMs,
      signal,
    );
  };

  try {
    const workspace = workspaceFor(cwd, workspaceKey);
    await request('workspace/upsertModelProvider', {
      workspace,
      provider: providerSelection.provider,
    });
    await request('workspace/setDefaultModel', {
      workspace,
      model: providerSelection.model,
    });
    const trimmedResumeSessionId = resumeSessionId?.trim() || null;
    let sessionId: string;
    if (trimmedResumeSessionId) {
      try {
        sessionId = sessionIdFromCreateResponse(
          await request('session/resume', {
            sessionId: trimmedResumeSessionId,
            workspace,
          }),
        );
      } catch (error) {
        if (isZcodeResumeMissingError(error)) {
          throw new ZcodeResumeSessionMissingError(trimmedResumeSessionId, error);
        }
        throw error;
      }
    } else {
      sessionId = sessionIdFromCreateResponse(await request('session/create', { workspace }));
    }

    if (mode?.trim()) {
      await request('session/setMode', { sessionId, mode: mode.trim() });
    }
    await request('session/subscribe', { sessionId, deliveryKind });
    await request('session/send', { sessionId, content: prompt });

    return { sessionId, unsubscribe };
  } catch (error) {
    unsubscribe();
    throw error;
  }
}
