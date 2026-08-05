export type UploadApiErrorCode = 'PAYLOAD_TOO_LARGE' | 'BAD_REQUEST';

export interface UploadErrorClassification {
  status: 400 | 413;
  code: UploadApiErrorCode;
  message: string;
  legacyCode: string;
}

const UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: 'file too large',
  LIMIT_FILE_COUNT: 'too many files',
  LIMIT_UNEXPECTED_FILE: 'unexpected file field',
  LIMIT_PART_COUNT: 'too many form parts',
  LIMIT_FIELD_KEY: 'field name too long',
  LIMIT_FIELD_VALUE: 'field value too long',
  LIMIT_FIELD_COUNT: 'too many form fields',
  MISSING_FIELD_NAME: 'missing field name',
};

/** Map Multer's legacy limit codes to the daemon's stable upload contract. */
export function classifyUploadError(code: unknown): UploadErrorClassification {
  const legacyCode = typeof code === 'string' && code.length > 0 ? code : 'UPLOAD_ERROR';
  return {
    status: legacyCode === 'LIMIT_FILE_SIZE' ? 413 : 400,
    code: legacyCode === 'LIMIT_FILE_SIZE' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
    message: UPLOAD_ERROR_MESSAGES[legacyCode] ?? 'upload failed',
    legacyCode,
  };
}
