import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatDesignFilesWorkspaceHint,
  formatProjectAttachmentHint,
  renderEditableSnapshotTargetHint,
  renderProjectFilesListBlock,
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

describe('renderProjectFilesListBlock', () => {
  it('lists every file for small projects', () => {
    const block = renderProjectFilesListBlock([
      { name: 'index.html' },
      { name: 'assets/logo.svg' },
    ]);

    expect(block).toContain('- index.html');
    expect(block).toContain('- assets/logo.svg');
    expect(block).not.toContain('compact sample');
  });

  it('summarizes huge imported project file lists and keeps attached files visible', () => {
    const activeSnapshot = 'design-snapshots/search-apps-web-src-app-main-search-page-tsx.html';
    const files = [
      { name: 'apps/web/src/app/main/search/page.tsx' },
      { name: activeSnapshot },
      ...Array.from({ length: 9_500 }, (_, index) => ({
        name: `apps/web/src/generated/component-${index}.tsx`,
      })),
    ];

    const block = renderProjectFilesListBlock(files, {
      priorityNames: [activeSnapshot],
      maxEntries: 80,
      maxChars: 12_000,
    });

    expect(block.length).toBeLessThan(14_000);
    expect(block).toContain('Project has 9502 files');
    expect(block).toContain(`\`${activeSnapshot}\``);
    expect(block).toContain(`- ${activeSnapshot}`);
    expect(block).toContain('more files omitted');
    expect(block).not.toContain('component-9499.tsx');
  });

  it('does not duplicate priority files in the representative sample', () => {
    const block = renderProjectFilesListBlock(
      [
        { name: 'design-snapshots/home.html' },
        { name: 'index.html' },
        ...Array.from({ length: 20 }, (_, index) => ({
          name: `src/file-${index}.tsx`,
        })),
      ],
      {
        priorityNames: ['design-snapshots/home.html'],
        maxEntries: 5,
        maxChars: 1_000,
      },
    );

    expect(block.match(/design-snapshots\/home\.html/g)).toHaveLength(2);
  });
});

describe('renderEditableSnapshotTargetHint', () => {
  it('directs design edits to the attached rendered snapshot html', () => {
    const hint = renderEditableSnapshotTargetHint([
      'design-snapshots/scheduling-book-apps-web-src-app-main-scheduling-book-page-tsx.html',
      'apps/web/src/app/main/scheduling/book/page.tsx',
      'apps/web/src/app/globals.css',
    ]);

    expect(hint).toContain(
      'Primary editable design snapshot: `design-snapshots/scheduling-book-apps-web-src-app-main-scheduling-book-page-tsx.html`.',
    );
    expect(hint).toContain('edit this HTML file directly');
    expect(hint).toContain('currently rendered in Preview');
    expect(hint).toContain('do not apply the requested design change to TSX, JSX, Vue, Svelte, CSS, or other original app source');
    expect(hint).toContain('User-facing updates must describe the design/rendered preview change only');
    expect(hint).toContain('Do not mention inline styles, computed styles, generated HTML, srcDoc, snapshot internals');
  });

  it('stays silent when no editable snapshot is attached', () => {
    expect(renderEditableSnapshotTargetHint([
      'apps/web/src/app/main/scheduling/book/page.tsx',
      'apps/web/src/app/globals.css',
    ])).toBe('');
  });
});
