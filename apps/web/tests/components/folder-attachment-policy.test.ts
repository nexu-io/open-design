import { describe, expect, it } from 'vitest';

import {
  MAX_FOLDER_ATTACHMENT_FILE_BYTES,
  MAX_FOLDER_ATTACHMENT_FILES,
  MAX_FOLDER_ATTACHMENT_TOTAL_BYTES,
  selectFolderAttachmentFiles,
} from '../../src/components/folder-attachment-policy';

function fileWithPath(relativePath: string, contents: BlobPart = 'x'): File {
  const name = relativePath.split('/').at(-1) ?? 'file.txt';
  const file = new File([contents], name);
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
}

describe('folder attachment policy', () => {
  it('caps recursive folder selections by file count', () => {
    const files = Array.from(
      { length: MAX_FOLDER_ATTACHMENT_FILES + 1 },
      (_, index) => fileWithPath(`site/src/file-${index}.txt`),
    );

    const result = selectFolderAttachmentFiles(files);

    expect(result.accepted).toHaveLength(MAX_FOLDER_ATTACHMENT_FILES);
    expect(result.skippedCount).toBe(1);
  });

  it('caps recursive folder selections by aggregate bytes', () => {
    const oneMiB = new Uint8Array(MAX_FOLDER_ATTACHMENT_FILE_BYTES);
    const aggregateQuota = MAX_FOLDER_ATTACHMENT_TOTAL_BYTES / MAX_FOLDER_ATTACHMENT_FILE_BYTES;
    const files = Array.from(
      { length: aggregateQuota + 1 },
      (_, index) => fileWithPath(`site/src/large-${index}.bin`, oneMiB),
    );

    const result = selectFolderAttachmentFiles(files);

    expect(result.accepted).toHaveLength(aggregateQuota);
    expect(result.skippedCount).toBe(1);
  });
});
