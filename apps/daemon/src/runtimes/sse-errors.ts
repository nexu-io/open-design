import type {
  ApiError,
  ApiErrorCode,
  JsonValue,
  SseErrorPayload,
} from '@open-design/contracts';
import { createCompatApiError } from '../http/api-errors.js';

export function createSseErrorPayload(
  code: ApiErrorCode,
  message: string,
  init: Omit<ApiError, 'code' | 'message'> = {},
): SseErrorPayload {
  return { message, error: createCompatApiError(code, message, init) };
}

export function rewriteKnownAgentStreamError(
  agentId: string,
  message: unknown,
  failureText = '',
): string {
  const rawMessage =
    typeof message === 'string' && message.trim()
      ? message.trim()
      : 'Agent stream error';
  const combined = `${rawMessage}\n${failureText}`;
  if (
    /bufio\.scanner:\s*token too long/i.test(combined) &&
    /opencode/i.test(combined) &&
    (agentId === 'opencode' || agentId === 'amr' || /json-rpc id \d+/i.test(combined))
  ) {
    return 'The run failed due to an unknown upstream streaming error. Please retry.';
  }
  return rawMessage;
}

export function createAmrModelUnavailablePayload(
  model: unknown,
  init: Record<string, JsonValue> = {},
): SseErrorPayload {
  const modelText = typeof model === 'string' && model.trim()
    ? `"${model.trim()}"`
    : 'the selected model';
  return createSseErrorPayload(
    'AMR_MODEL_UNAVAILABLE',
    `AMR model ${modelText} is not available from Vela. Refresh the AMR model list, choose a supported model, and retry this run.`,
    {
      retryable: false,
      details: {
        kind: 'amr_model',
        action: 'choose_model',
        ...(typeof model === 'string' && model.trim() ? { model: model.trim() } : {}),
        ...init,
      },
    },
  );
}
