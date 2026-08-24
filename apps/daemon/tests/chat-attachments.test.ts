import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatDesignFilesWorkspaceHint,
  formatProjectAttachmentHint,
  resolveAbsoluteProjectImageAttachments,
  resolveByokOpenCodeImagePaths,
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

describe('resolveAbsoluteProjectImageAttachments', () => {
  it('keeps only unique, existing, in-project image files within the size limit', () => {
    const root = '/project';
    const stats = new Map([
      ['/project/first.png', { isFile: () => true, size: 128 }],
      ['/project/second.webp', { isFile: () => true, size: 256 }],
      ['/project/folder.gif', { isFile: () => false, size: 0 }],
      ['/project/large.jpg', { isFile: () => true, size: 1025 }],
      ['/project/notes.txt', { isFile: () => true, size: 10 }],
    ]);

    expect(resolveAbsoluteProjectImageAttachments(root, [
      'first.png',
      './first.png',
      'second.webp',
      '../escape.png',
      'missing.jpeg',
      'folder.gif',
      'large.jpg',
      'notes.txt',
    ], {
      maxBytes: 1024,
      statSync: (target: string) => {
        const result = stats.get(target);
        if (!result) throw new Error('missing');
        return result as never;
      },
    })).toEqual(['/project/first.png', '/project/second.webp']);
  });

  it('accepts PNG, JPEG, GIF, and WebP extensions case-insensitively', () => {
    expect(resolveAbsoluteProjectImageAttachments('/project', [
      'a.PNG', 'b.jpg', 'c.JPEG', 'd.Gif', 'e.WEBP',
    ], {
      statSync: () => ({ isFile: () => true, size: 1 }) as never,
    })).toEqual([
      '/project/a.PNG',
      '/project/b.jpg',
      '/project/c.JPEG',
      '/project/d.Gif',
      '/project/e.WEBP',
    ]);
  });
});

describe('resolveByokOpenCodeImagePaths', () => {
  it('merges direct uploads and project images for enabled BYOK runs', () => {
    expect(resolveByokOpenCodeImagePaths({
      enabled: true,
      cwd: '/project',
      attachments: ['saved.png', 'saved.png'],
      promptImagePaths: [
        '/tmp/od-uploads/direct.png',
        '/tmp/od-uploads/direct.png',
        '/tmp/od-uploads/not-an-image.txt',
      ],
    }, {
      statSync: () => ({ isFile: () => true, size: 1 }),
    })).toEqual([
      '/tmp/od-uploads/direct.png',
      '/project/saved.png',
    ]);
  });

  it('keeps legacy and disabled BYOK runs text-only', () => {
    expect(resolveByokOpenCodeImagePaths({
      enabled: false,
      cwd: '/project',
      attachments: ['saved.png'],
      promptImagePaths: ['/tmp/od-uploads/direct.png'],
    }, {
      statSync: () => ({ isFile: () => true, size: 1 }),
    })).toEqual([]);
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
