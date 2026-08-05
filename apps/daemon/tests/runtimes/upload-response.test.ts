import type { Response } from 'express';
import multer from 'multer';
import { describe, expect, it, vi } from 'vitest';
import { createMulterErrorResponder } from '../../src/runtimes/upload-response.js';
import type { sendApiError } from '../../src/http/api-errors.js';

type SendApiError = typeof sendApiError;

describe('multipart upload error responder', () => {
  it('maps Multer size errors to the stable 413 contract', () => {
    const response = {} as Response;
    const sendApiError = vi.fn((_res: Response) => response) as unknown as SendApiError;
    const sendMulterError = createMulterErrorResponder(sendApiError);

    sendMulterError(response, new multer.MulterError('LIMIT_FILE_SIZE'));

    expect(sendApiError).toHaveBeenCalledWith(
      response,
      413,
      'PAYLOAD_TOO_LARGE',
      'file too large',
      { details: { legacyCode: 'LIMIT_FILE_SIZE' } },
    );
  });

  it('maps other Multer limits and unknown errors without leaking internals', () => {
    const response = {} as Response;
    const sendApiError = vi.fn((_res: Response) => response) as unknown as SendApiError;
    const sendMulterError = createMulterErrorResponder(sendApiError);

    sendMulterError(response, new multer.MulterError('LIMIT_UNEXPECTED_FILE'));
    sendMulterError(response, new Error('private filesystem detail'));

    expect(sendApiError).toHaveBeenNthCalledWith(
      1,
      response,
      400,
      'BAD_REQUEST',
      'unexpected file field',
      { details: { legacyCode: 'LIMIT_UNEXPECTED_FILE' } },
    );
    expect(sendApiError).toHaveBeenNthCalledWith(
      2,
      response,
      500,
      'INTERNAL_ERROR',
      'upload failed',
    );
  });
});
