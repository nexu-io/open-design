import { describe, expect, it } from 'vitest';

import {
  FILE_SYSTEM_READ_ERROR_MESSAGE,
  createFileSystemReadError,
  isFileSystemReadError,
} from '../../src/utils/fileSystemErrors';

describe('createFileSystemReadError', () => {
  it('wraps DOMException-like file system failures in a stack-bearing Error', () => {
    const cause = new DOMException(
      'A requested file or directory could not be found at the time an operation was processed.',
      'NotFoundError',
    );

    const error = createFileSystemReadError('Could not read dropped file', cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('FileSystemReadError');
    expect(error.message).toContain('Could not read dropped file');
    expect(error.message).toContain('NotFoundError');
    expect(error.cause).toBe(cause);
    expect(error.stack).toEqual(expect.any(String));
    expect(isFileSystemReadError(error)).toBe(true);
    expect(FILE_SYSTEM_READ_ERROR_MESSAGE).toContain('try again');
  });
});
