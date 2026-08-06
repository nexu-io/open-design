import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatDesignFilesWorkspaceHint,
  formatProjectAttachmentHint,
  mergePromptImagePaths,
  resolveAbsoluteProjectImageAttachments,
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

describe('resolveAbsoluteProjectImageAttachments (#6482 web attachments path)', () => {
  it('returns absolute paths for image attachments under cwd and drops non-images / escapes', () => {
    const root = '/projects/demo';
    const files = new Map<string, number>([
      ['/projects/demo/shot.png', 12_000],
      ['/projects/demo/assets/mark.JPG', 8_000],
      ['/projects/demo/notes.md', 400],
      ['/projects/demo/huge.png', 2_000_000],
    ]);

    const abs = resolveAbsoluteProjectImageAttachments(
      root,
      [
        'shot.png',
        'assets/mark.JPG',
        'notes.md',
        'huge.png',
        '../escape.png',
        'missing.png',
      ],
      {
        pathImpl: path.posix,
        existsSync: (target) => files.has(target),
        statSync: (target) => ({
          isFile: () => true,
          size: files.get(target) ?? 0,
        }),
        maxBytes: 1_024_000,
      },
    );

    expect(abs).toEqual([
      '/projects/demo/shot.png',
      '/projects/demo/assets/mark.JPG',
    ]);
  });

  it('mergePromptImagePaths de-dupes upload-dir and project image paths', () => {
    expect(
      mergePromptImagePaths(
        ['/tmp/od-uploads/a.png', '/projects/demo/shot.png'],
        ['/projects/demo/shot.png', '/projects/demo/b.webp'],
      ),
    ).toEqual([
      '/tmp/od-uploads/a.png',
      '/projects/demo/shot.png',
      '/projects/demo/b.webp',
    ]);
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
    expect(hint).toContain('investor-pitch-deck.html');
    expect(hint).toContain('choose semantic filenames from the brief instead of defaulting to `index.html`');
    expect(hint).toContain('If the user did not attach any file, do not assume there are no relevant Design Files.');
    expect(hint).toContain('inspect/search/read this workspace before answering or editing');
    expect(hint).toContain('Folders:\n- `slides` (folder)');
    expect(hint).toContain('Files:\n- `slides/pitch.html` (html, 2 KB)');
    expect(hint).toContain('- `image.png` (image, 192 KB)');
  });
});
