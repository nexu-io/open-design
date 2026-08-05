import { describe, expect, it } from 'vitest';
import { classifyUploadError } from '../../src/runtimes/upload-errors.js';

describe('upload error contract', () => {
  it('maps file-size limits to a payload-too-large response', () => {
    expect(classifyUploadError('LIMIT_FILE_SIZE')).toEqual({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'file too large',
      legacyCode: 'LIMIT_FILE_SIZE',
    });
  });

  it('maps known non-size limits to bounded bad-request messages', () => {
    expect(classifyUploadError('LIMIT_FILE_COUNT')).toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
      message: 'too many files',
      legacyCode: 'LIMIT_FILE_COUNT',
    });
    expect(classifyUploadError('UNKNOWN_LIMIT')).toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
      message: 'upload failed',
      legacyCode: 'UNKNOWN_LIMIT',
    });
  });

  it('normalizes malformed codes without exposing arbitrary values as messages', () => {
    expect(classifyUploadError(null)).toEqual({
      status: 400,
      code: 'BAD_REQUEST',
      message: 'upload failed',
      legacyCode: 'UPLOAD_ERROR',
    });
  });
});
