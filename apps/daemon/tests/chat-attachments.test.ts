import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveProjectFilePath } from '../src/projects.js';
import {
  isCodexPromptImage,
  resolveCodexPromptImages,
  resolveCodexUploadedImages,
} from '../src/runtimes/codex-image-inputs.js';
import {
  formatDesignFilesWorkspaceHint,
  formatProjectAttachmentHint,
  resolveSafeProjectAttachments,
} from '../src/server.js';
import {
  buildOdNextTaskConfigurationV1,
  createOdNextRunInputProjection,
  createOdNextTaskInputSnapshot,
  removeOdNextRunInputProjection,
  removeOdNextTaskInputSnapshot,
} from '../src/strategies/od-next/task-input-snapshot.js';

const png = Buffer.from('89504e470d0a1a0a', 'hex');

describe('Codex project images', () => {
  it('recognizes legacy uploads by bytes and retains only images inside the upload root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-codex-upload-images-'));
    try {
      const uploads = path.join(root, 'uploads');
      const first = path.join(uploads, 'first.png');
      const second = path.join(uploads, 'second.bin');
      const mislabeled = path.join(uploads, 'text.png');
      const outside = path.join(root, 'outside.png');
      await mkdir(uploads);
      await Promise.all([
        writeFile(first, png),
        writeFile(second, png),
        writeFile(mislabeled, 'synthetic text'),
        writeFile(outside, png),
      ]);
      const images = await resolveCodexUploadedImages([second, mislabeled, outside, first, second], uploads);
      expect(images).toEqual(await Promise.all([second, first].map((file) => realpath(file))));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps valid project images in order and leaves other files as references', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-codex-project-images-'));
    try {
      const project = path.join(root, 'fixture-project');
      await mkdir(project);
      await Promise.all([
        writeFile(path.join(project, 'first.png'), png),
        writeFile(path.join(project, 'second.png'), png),
        writeFile(path.join(project, 'brief.txt'), 'plain text'),
        writeFile(path.join(project, 'invalid.png'), 'plain text'),
        writeFile(path.join(project, 'large.png'), Buffer.concat([png, Buffer.alloc(1024 * 1024)])),
        writeFile(path.join(root, 'outside.png'), png),
      ]);
      const second = await realpath(path.join(project, 'second.png'));
      const first = await realpath(path.join(project, 'first.png'));
      const images = await resolveCodexPromptImages(
        ['second.png', 'brief.txt', 'invalid.png', 'large.png', '../outside.png', 'first.png', 'second.png'],
        [first],
        async (name) => (await resolveProjectFilePath(root, 'fixture-project', name)).filePath,
      );
      expect(images).toEqual([second, first]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('selects verified projection images once per project source without dropping same-byte files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-codex-projected-images-'));
    const snapshotsRoot = path.join(root, 'snapshots');
    const projectRoot = path.join(root, 'project');
    const uploaded = path.join(root, 'uploaded.png');
    const projectionsRoot = path.join(root, 'projections');
    await mkdir(projectRoot);
    await Promise.all([
      writeFile(path.join(projectRoot, 'first.png'), png),
      writeFile(path.join(projectRoot, 'second.png'), png),
      writeFile(path.join(projectRoot, 'brief.txt'), 'plain text'),
      writeFile(uploaded, png),
    ]);
    const descriptor = createOdNextTaskInputSnapshot({
      snapshotsRoot,
      taskExecutionId: 'codex-attachment-test',
      taskConfiguration: buildOdNextTaskConfigurationV1({
        taskType: 'prototype', locale: 'en_US', selectedAgentId: 'codex', sessionMode: 'design',
        mediaExecution: { mode: 'enabled' },
      }),
      projectRoot,
      projectAttachments: ['first.png', 'brief.txt', 'second.png', 'first.png'],
      uploadRoot: root,
      imagePaths: [uploaded],
    });
    try {
      for (const projectImageFilter of [undefined, isCodexPromptImage]) {
        const projection = createOdNextRunInputProjection({
          descriptor, snapshotsRoot, projectionsRoot, runId: 'codex-attachment-test',
          ...(projectImageFilter ? { projectImageFilter } : {}),
        });
        try {
          expect(projection.attachmentPaths).toHaveLength(5);
          expect(projection.imagePaths).toEqual(
            (projectImageFilter ? [0, 2, 4] : [4]).map((index) => projection.attachmentPaths[index]),
          );
        } finally {
          removeOdNextRunInputProjection(projection);
        }
      }
    } finally {
      removeOdNextTaskInputSnapshot(descriptor, snapshotsRoot);
      await rm(root, { recursive: true, force: true });
    }
  });
});

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
    expect(hint).toContain('investor-pitch-deck.html');
    expect(hint).toContain('choose semantic filenames from the brief instead of defaulting to `index.html`');
    expect(hint).toContain('If the user did not attach any file, do not assume there are no relevant Design Files.');
    expect(hint).toContain('inspect/search/read this workspace before answering or editing');
    expect(hint).toContain('Folders:\n- `slides` (folder)');
    expect(hint).toContain('Files:\n- `slides/pitch.html` (html, 2 KB)');
    expect(hint).toContain('- `image.png` (image, 192 KB)');
  });
});
