/** ACP extension. A cursor continues persisted work; it never authorizes prompt replay. */
export const AMR_CONTINUATION_CAPABILITY = 'com.open-design.nativeSessionContinue';
export const AMR_CONTINUATION_ERROR_CODE = 'OPENCODE_COMPACTION_CONTINUATION_INCOMPLETE';

export interface AmrContinuationCursor {
  version: 1;
  userMessageId: string;
  assistantMessageId: string;
  toolResultsCommitted: true;
}

export interface AmrContinuationRecovery {
  sessionId: string;
  cursor: AmrContinuationCursor;
}

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 256;

export function supportsAmrNativeContinuation(initializeResult: unknown): boolean {
  const capabilities = object(object(initializeResult)?.agentCapabilities);
  return capabilities?.loadSession === true &&
    object(object(capabilities._meta)?.[AMR_CONTINUATION_CAPABILITY])?.version === 1;
}

/** Call only on the RPC failure channel, never on assistant prose. */
export function isAmrContinuationIncomplete(message: string, data: unknown): boolean {
  const details = object(data);
  return details?.code === AMR_CONTINUATION_ERROR_CODE ||
    /^(?:json-rpc id \d+: )?(?:opencode event stream: )?opencode compaction continuation ended before prompt completion\s*$/i.test(message);
}

export function parseAmrContinuationRecovery(data: unknown): AmrContinuationRecovery | null {
  const details = object(data);
  const cursor = object(details?.continuation);
  if (details?.code !== AMR_CONTINUATION_ERROR_CODE ||
      details.kind !== 'opencode_continuation_incomplete' || details.runtime !== 'opencode' ||
      details.phase !== 'post_tool_resume' || !identifier(details.openCodeSessionId) ||
      cursor?.version !== 1 || cursor.toolResultsCommitted !== true ||
      !identifier(cursor.userMessageId) || !identifier(cursor.assistantMessageId)) return null;
  return {
    sessionId: details.openCodeSessionId,
    cursor: { version: 1, userMessageId: cursor.userMessageId,
      assistantMessageId: cursor.assistantMessageId, toolResultsCommitted: true },
  };
}
