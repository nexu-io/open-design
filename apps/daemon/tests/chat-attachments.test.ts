import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatDesignFilesWorkspaceHint,
  formatProjectAttachmentHint,
  resolveSafeProjectAttachments,
} from '../src/server.js';

describe('resolveSafeProjectAttachments', () => {
  it('keeps Windows attachments when root and attachment path use different separators and drive casing', () => {
    const existing = new Set([
      'C:\\Users\\Designer\\Open Design\\m5-logo.png',
      'c:\\users\\designer\\open design\\assets\\mark.png',
    ]);

    const safe = resolveSafeProjectAttachments(
      'C:/Users/Designer/Open Design/',
      [
        'm5-logo.png',
        'c:/users/designer/open design/assets/mark.png',
        'C:/Users/Designer/Open Design Adjacent/secret.png',
        '..\\secret.png',
      ],
      {
        existsSync: (target: string) => existing.has(target),
        pathImpl: path.win32,
      },
    );

    expect(safe).toEqual([
      'm5-logo.png',
      'c:/users/designer/open design/assets/mark.png',
    ]);
  });

  it('renders project attachments in explicit user-visible order', () => {
    expect(formatProjectAttachmentHint(['first.png', 'second.png'])).toContain(
      [
        'Attached project files in user-visible order:',
        '1. `first.png`',
        '2. `second.png`',
        '',
        'When the user says "first attachment", "second file", or similar, map those references to the numbered list above.',
      ].join('\n'),
    );
  });
});

describe('formatDesignFilesWorkspaceHint', () => {
  it('treats unselected Design Files as searchable project context', () => {
    const hint = formatDesignFilesWorkspaceHint(
      '/tmp/open-design/project-1',
      [
        { name: 'slides/pitch.html', path: 'slides/pitch.html', kind: 'html', size: 2048 },
        { name: 'image.png', path: 'image.png', kind: 'image', size: 196_100 },
      ],
      [{ name: 'slides', path: 'slides', type: 'dir', size: 0 }],
    );

    expect(hint).toContain('## Design Files workspace');
    expect(hint).toContain('If the user did not attach any file, do not assume there are no relevant Design Files.');
    expect(hint).toContain('inspect/search/read this workspace before answering or editing');
    expect(hint).toContain('Folders:\n- `slides` (folder)');
    expect(hint).toContain('Files:\n- `slides/pitch.html` (html, 2 KB)');
    expect(hint).toContain('- `image.png` (image, 192 KB)');
  });
});
