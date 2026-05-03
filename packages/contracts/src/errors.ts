import type { JsonValue } from './common.js';

export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'VALIDATION_FAILED',
  'AGENT_UNAVAILABLE',
  'AGENT_EXECUTION_FAILED',
  'PROJECT_NOT_FOUND',
  'FILE_NOT_FOUND',
  'ARTIFACT_NOT_FOUND',
  'UPSTREAM_UNAVAILABLE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: JsonValue;
  retryable?: boolean;
  requestId?: string;
  taskId?: string;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export type LegacyErrorResponse =
  | { error: string }
  | { code: string; error: string };

export type CompatibleErrorResponse = ApiErrorResponse | LegacyErrorResponse;

export interface SseErrorPayload {
  message: string;
  error?: ApiError;
}

export function createApiError(code: ApiErrorCode, message: string, init: Omit<ApiError, 'code' | 'message'> = {}): ApiError {
  return { code, message, ...init };
}

export function createApiErrorResponse(error: ApiError): ApiErrorResponse {
  return { error };
}
