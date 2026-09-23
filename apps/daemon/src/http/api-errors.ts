import type { ApiError, ApiErrorCode, ApiErrorResponse } from '@open-design/contracts';
import type { Response } from 'express';

import { recordApiFailure } from './api-failure-journal.js';

export function createCompatApiError(
  code: ApiErrorCode,
  message: string,
  init: Omit<ApiError, 'code' | 'message'> = {},
): ApiError {
  return { code, message, ...init };
}

export function createCompatApiErrorResponse(
  code: ApiErrorCode,
  message: string,
  init: Omit<ApiError, 'code' | 'message'> = {},
): ApiErrorResponse {
  return { error: createCompatApiError(code, message, init) };
}

export function sendApiError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  init: Omit<ApiError, 'code' | 'message'> = {},
): Response<ApiErrorResponse> {
  const request = res.req;
  recordApiFailure({
    at: new Date().toISOString(),
    request,
    status,
    code,
    retryable: init.retryable === true,
    ...(init.requestId ? { requestId: init.requestId } : {}),
  });
  return res
    .status(status)
    .json(createCompatApiErrorResponse(code, message, init));
}
