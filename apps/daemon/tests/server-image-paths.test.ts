import { expect, test } from 'vitest';

import { selectPromptImagePaths } from '../src/server.js';

test('selectPromptImagePaths uses staged AMR paths in prompt text', () => {
  expect(
    selectPromptImagePaths(
      'amr',
      ['/tmp/od-uploads/original.png'],
      ['/project/.amr-attachments/staged.png'],
    ),
  ).toEqual(['/project/.amr-attachments/staged.png']);
});

test('selectPromptImagePaths keeps original paths for non-AMR agents', () => {
  expect(
    selectPromptImagePaths(
      'opencode',
      ['/tmp/od-uploads/original.png'],
      ['/project/.amr-attachments/staged.png'],
    ),
  ).toEqual(['/tmp/od-uploads/original.png']);
});
