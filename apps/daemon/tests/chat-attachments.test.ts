import fs from 'node:fs';
import os from 'node:os';
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
      'C:\\Users\\Designer\\Marketing AX\\m5-logo.png',
      'c:\\users\\designer\\marketing ax\\assets\\mark.png',
    ]);

    const safe = resolveSafeProjectAttachments(
      'C:/Users/Designer/Marketing AX/',
      [
        'm5-logo.png',
        'c:/users/designer/marketing ax/assets/mark.png',
        'C:/Users/Designer/Marketing AX Adjacent/secret.png',
        '..\\secret.png',
      ],
      {
        existsSync: (target: string) => existing.has(target),
        pathImpl: path.win32,
      },
    );

    expect(safe).toEqual([
      'm5-logo.png',
      'c:/users/designer/marketing ax/assets/mark.png',
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

  it('advertises the symlink-resolved cwd the agent observes via process.cwd(), not the spawn-time spelling', () => {
    // PR #10 adjacent issue: the agent's process.cwd() reports the physical
    // (realpath) directory, so the prompt must advertise that same spelling
    // instead of the unresolved spawn path — otherwise the model sees two
    // spellings of one directory (e.g. /var/... vs /private/var/... on macOS).
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'od-cwd-hint-'));
    try {
      const realDir = path.join(base, 'workspace-real');
      fs.mkdirSync(realDir);
      const symlinkCwd = path.join(base, 'workspace-link');
      fs.symlinkSync(realDir, symlinkCwd, 'dir');
      const resolvedCwd = fs.realpathSync.native(symlinkCwd);

      const hint = formatDesignFilesWorkspaceHint(symlinkCwd, [], []);

      expect(hint).toContain(`\`${resolvedCwd}\``);
      expect(hint).not.toContain(symlinkCwd);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it('falls back to the given cwd when the directory cannot be realpath-resolved', () => {
    const missingCwd = path.join(os.tmpdir(), 'od-cwd-hint-missing', 'does-not-exist');
    const hint = formatDesignFilesWorkspaceHint(missingCwd, [], []);
    expect(hint).toContain(`\`${missingCwd}\``);
  });
});
