import type { ApiError, ApiErrorCode } from '@open-design/contracts';
import multer from 'multer';
import type { Response } from 'express';
import { classifyUploadError } from './upload-errors.js';

type SendApiError = (
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  init?: Omit<ApiError, 'code' | 'message'>,
) => Response;

export type MulterErrorResponder = (res: Response, err: unknown) => Response;

/** Keep multipart implementation details at the HTTP error boundary. */
export function createMulterErrorResponder(sendApiError: SendApiError): MulterErrorResponder {
  return (res: Response, err: unknown): Response => {
    if (err instanceof multer.MulterError) {
      const classification = classifyUploadError(err.code);
      return sendApiError(
        res,
        classification.status,
        classification.code,
        classification.message,
        { details: { legacyCode: classification.legacyCode } },
      );
    }

    return sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
  };
}
