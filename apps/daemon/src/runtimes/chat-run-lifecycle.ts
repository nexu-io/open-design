const DEFAULT_CHAT_RUN_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_CHAT_RUN_INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CHAT_RUN_ARTIFACT_QUIET_PERIOD_MS = 60 * 1000;

export function assertValidRuntimeDefInactivityTimeoutMs(agentDefault?: number): void {
  if (agentDefault === undefined) return;
  if (!Number.isFinite(agentDefault) || agentDefault < 0 || !Number.isInteger(agentDefault)) {
    throw new RangeError(
      `RuntimeAgentDef.inactivityTimeoutMs must be a non-negative integer, got ${String(agentDefault)}. ` +
        'Fix the runtime def — invalid values used to silently disable the watchdog.',
    );
  }
}

export function resolveChatRunInactivityTimeoutMs(agentDefault?: number) {
  assertValidRuntimeDefInactivityTimeoutMs(agentDefault);
  const env = Number(process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS);
  if (Number.isFinite(env)) {
    return Math.min(MAX_CHAT_RUN_INACTIVITY_TIMEOUT_MS, Math.max(0, Math.floor(env)));
  }
  if (agentDefault !== undefined) {
    return Math.min(MAX_CHAT_RUN_INACTIVITY_TIMEOUT_MS, agentDefault);
  }
  return DEFAULT_CHAT_RUN_INACTIVITY_TIMEOUT_MS;
}

export function resolveChatRunArtifactQuietPeriodMs() {
  const raw = Number(process.env.OD_CHAT_RUN_ARTIFACT_QUIET_PERIOD_MS);
  if (!Number.isFinite(raw)) return DEFAULT_CHAT_RUN_ARTIFACT_QUIET_PERIOD_MS;
  return Math.min(MAX_CHAT_RUN_INACTIVITY_TIMEOUT_MS, Math.max(0, Math.floor(raw)));
}

export function resolveActiveInactivityTimeoutMs(params: {
  inactivityTimeoutMs: number;
  artifactQuietPeriodMs: number;
  artifactRegistered: boolean;
}): number {
  if (params.artifactRegistered && params.artifactQuietPeriodMs > 0) {
    return params.artifactQuietPeriodMs;
  }
  return params.inactivityTimeoutMs;
}

export function classifyChatRunCloseStatus(params: {
  cancelRequested: boolean;
  code: number | null;
  signal: NodeJS.Signals | string | null;
  acpCleanCompletion: boolean;
  artifactQuietShutdownRequested: boolean;
  turnCompletedCleanly: boolean;
  artifactProducedThisRun: boolean;
}): 'canceled' | 'succeeded' | 'failed' {
  if (params.cancelRequested) return 'canceled';
  if (params.code === 0) return 'succeeded';
  const acpForcedShutdown =
    params.acpCleanCompletion &&
    (
      (params.code === null && params.signal === 'SIGTERM') ||
      (params.code === 130 && params.signal === null)
    );
  if (acpForcedShutdown) return 'succeeded';
  const artifactQuietShutdown =
    params.artifactQuietShutdownRequested &&
    params.code === null &&
    (params.signal === 'SIGTERM' || params.signal === 'SIGKILL');
  if (artifactQuietShutdown) return 'succeeded';
  if (params.code != null && params.code !== 0 && params.artifactProducedThisRun) {
    return 'succeeded';
  }
  if (params.turnCompletedCleanly) return 'succeeded';
  return 'failed';
}

type ClaudeStreamJsonBookkeepingRun = {
  stdinOpen?: boolean;
  turnCompletedCleanly?: boolean;
  child?: {
    stdin?: {
      destroyed?: boolean;
      end: () => void;
    } | null;
  } | null;
};

export function applyClaudeStreamJsonRunBookkeeping(
  run: ClaudeStreamJsonBookkeepingRun,
  ev: unknown,
) {
  if (!ev || typeof ev !== 'object') return;
  const event = ev as {
    type?: unknown;
    name?: unknown;
    id?: unknown;
    stopReason?: unknown;
    isError?: unknown;
  };

  const terminalTurn =
    (event.type === 'turn_end' && event.stopReason !== 'tool_use') ||
    (event.type === 'usage' && event.stopReason !== 'tool_use');
  if (!terminalTurn) return;

  // An error termination (is_error result frame) ends the turn — stdin must
  // still close — but it is NOT a clean completion: marking it clean lets
  // classifyChatRunCloseStatus translate the CLI's non-zero exit into
  // 'succeeded' and the failure never reaches the user. A SessionEnd-hook
  // non-zero exit after a normal result (#3373) carries no isError flag and
  // keeps taking the clean path.
  const errorTermination = event.type === 'usage' && event.isError === true;
  if (!errorTermination) {
    run.turnCompletedCleanly = true;
  }
  if (run.stdinOpen) {
    if (run.child?.stdin && !run.child.stdin.destroyed) {
      try { run.child.stdin.end(); } catch {}
    }
    run.stdinOpen = false;
  }
}

export function resolveChatRunShutdownGraceMs() {
  const raw = Number(process.env.OD_CHAT_RUN_SHUTDOWN_GRACE_MS);
  if (!Number.isFinite(raw)) return 3_000;
  return Math.max(0, Math.floor(raw));
}

export function resolveAcpStageTimeoutMs(agentDefault?: number): number | undefined {
  assertValidRuntimeDefInactivityTimeoutMs(agentDefault);
  const raw = Number(process.env.OD_ACP_STAGE_TIMEOUT_MS);
  if (Number.isFinite(raw)) {
    return Math.min(MAX_CHAT_RUN_INACTIVITY_TIMEOUT_MS, Math.max(0, Math.floor(raw)));
  }
  if (agentDefault !== undefined) {
    return Math.min(MAX_CHAT_RUN_INACTIVITY_TIMEOUT_MS, agentDefault);
  }
  return undefined;
}

type GeminiJsonEventStreamEvent = Record<string, unknown>;
type BufferedStdoutChunk = { text: string; receivedAt: number };

function parseGeminiJsonEventStreamEvents(text: string): GeminiJsonEventStreamEvent[] | null {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const events: GeminiJsonEventStreamEvent[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
      events.push(obj as GeminiJsonEventStreamEvent);
    } catch {
      return null;
    }
  }
  return events;
}

function isGeminiJsonEventStream(events: GeminiJsonEventStreamEvent[] | null): boolean {
  if (!events || events.length === 0) return false;
  const [firstEvent] = events;
  if (
    !firstEvent ||
    firstEvent.type !== 'init' ||
    typeof firstEvent.session_id !== 'string' ||
    firstEvent.session_id.length === 0 ||
    typeof firstEvent.model !== 'string' ||
    firstEvent.model.length === 0
  ) {
    return false;
  }
  return events.every((event) => {
    const type = event?.type;
    return (
      type === 'init' ||
      type === 'message' ||
      type === 'tool_use' ||
      type === 'tool_result' ||
      type === 'error' ||
      type === 'result'
    );
  });
}

function geminiJsonEventStreamHasVisibleAssistantText(
  events: GeminiJsonEventStreamEvent[] | null,
): boolean {
  if (!events) return false;
  return events.some((event) => (
    event.type === 'message' &&
    event.role === 'assistant' &&
    typeof event.content === 'string' &&
    event.content.length > 0
  ));
}

export function looksLikeGeminiJsonEventStream(text: string): boolean {
  return isGeminiJsonEventStream(parseGeminiJsonEventStreamEvents(text));
}

export function bufferedAntigravityGeminiFirstTokenAt(
  chunks: readonly BufferedStdoutChunk[],
): number | null {
  if (chunks.length === 0) return null;
  const text = chunks.map((chunk) => chunk.text).join('');
  const events = parseGeminiJsonEventStreamEvents(text);
  if (!isGeminiJsonEventStream(events)) return null;
  if (!geminiJsonEventStreamHasVisibleAssistantText(events)) return null;

  let offset = 0;
  for (const line of text.split(/(\r?\n)/u)) {
    const nextOffset = offset + line.length;
    if (line.length > 0 && line.trim().length > 0) {
      try {
        const event = JSON.parse(line) as GeminiJsonEventStreamEvent;
        if (
          event?.type === 'message' &&
          event.role === 'assistant' &&
          typeof event.content === 'string' &&
          event.content.length > 0
        ) {
          let consumed = 0;
          for (const chunk of chunks) {
            consumed += chunk.text.length;
            if (consumed >= nextOffset) return chunk.receivedAt;
          }
          return chunks.at(-1)?.receivedAt ?? null;
        }
      } catch {
        return null;
      }
    }
    offset = nextOffset;
  }
  return null;
}
