import type { JsonValue } from './common';
export declare const API_ERROR_CODES: readonly ["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "PAYLOAD_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE", "VALIDATION_FAILED", "AGENT_UNAVAILABLE", "AGENT_EXECUTION_FAILED", "AGENT_PROMPT_TOO_LARGE", "PROJECT_NOT_FOUND", "FILE_NOT_FOUND", "ARTIFACT_NOT_FOUND", "UPSTREAM_UNAVAILABLE", "RATE_LIMITED", "TOOL_TOKEN_MISSING", "TOOL_TOKEN_INVALID", "TOOL_TOKEN_EXPIRED", "TOOL_ENDPOINT_DENIED", "TOOL_OPERATION_DENIED", "LIVE_ARTIFACT_NOT_FOUND", "LIVE_ARTIFACT_INVALID", "LIVE_ARTIFACT_STORAGE_FAILED", "LIVE_ARTIFACT_REFRESH_UNAVAILABLE", "LIVE_ARTIFACT_REFRESH_TIMEOUT", "REFRESH_LOCKED", "REFRESH_TIMED_OUT", "REFRESH_FAILED", "OUTPUT_TOO_LARGE", "TEMPLATE_BINDING_INVALID", "REDACTION_REQUIRED", "CONNECTOR_NOT_FOUND", "CONNECTOR_NOT_CONNECTED", "CONNECTOR_DISABLED", "CONNECTOR_TOOL_NOT_FOUND", "CONNECTOR_SAFETY_DENIED", "CONNECTOR_INPUT_SCHEMA_MISMATCH", "CONNECTOR_RATE_LIMITED", "CONNECTOR_OUTPUT_TOO_LARGE", "CONNECTOR_EXECUTION_FAILED", "INTERNAL_ERROR"];
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
export type ApiValidationIssue = {
    /** Dot/bracket path, JSON pointer, or form field name that failed validation. */
    path: string;
    message: string;
    code?: string;
};
export type ApiValidationErrorDetails = {
    kind: 'validation';
    issues: ApiValidationIssue[];
};
/** Success payload or shared error envelope for agent-facing daemon tool endpoints. */
export type AgentToolApiResponse<TSuccess> = TSuccess | ApiErrorResponse;
export type LegacyErrorResponse = {
    error: string;
} | {
    code: string;
    error: string;
};
export type CompatibleErrorResponse = ApiErrorResponse | LegacyErrorResponse;
export interface SseErrorPayload {
    message: string;
    error?: ApiError;
}
export declare function createApiError(code: ApiErrorCode, message: string, init?: Omit<ApiError, 'code' | 'message'>): ApiError;
export declare function createApiErrorResponse(error: ApiError): ApiErrorResponse;
//# sourceMappingURL=errors.d.ts.map