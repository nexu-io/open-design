import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildOdNextTaskConfigurationV1,
  createOdNextRunInputProjection,
  createOdNextTaskInputSnapshot,
  loadOdNextTaskInputSnapshot,
  OdNextTaskInputSnapshotError,
  removeOdNextRunInputProjection,
} from '../../src/strategies/od-next/task-input-snapshot.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const roots: string[] = [];

function makeTreeWritable(target: string): void {
  if (!existsSync(target)) return;
  const stat = lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isDirectory()) return;
  chmodSync(target, 0o700);
  for (const entry of readdirSync(target)) makeTreeWritable(path.join(target, entry));
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'od-next-input-'));
  roots.push(root);
  const projectRoot = path.join(root, 'project');
  const uploadRoot = path.join(root, 'uploads');
  const snapshotsRoot = path.join(root, 'data', 'task-inputs');
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(uploadRoot, { recursive: true });
  const taskConfiguration = buildOdNextTaskConfigurationV1({
    taskType: 'prototype',
    locale: 'zh_CN',
    selectedAgentId: 'codex',
    sessionMode: 'design',
    mediaExecution: { mode: 'enabled' },
  });
  return { root, projectRoot, uploadRoot, snapshotsRoot, taskConfiguration };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    makeTreeWritable(root);
    rmSync(root, { recursive: true, force: true });
  }
});

describe('OD Next task-scoped input snapshots', () => {
  it('freezes ordered document/image bytes and survives source mutation or deletion', () => {
    const f = fixture();
    writeFileSync(path.join(f.projectRoot, 'brief.pdf'), Buffer.from('%PDF-1.7\nbrief'));
    const image = path.join(f.uploadRoot, 'screen.bin');
    writeFileSync(image, PNG);
    const descriptor = createOdNextTaskInputSnapshot({
      ...f,
      taskExecutionId: 'odnext_fixture',
      projectAttachments: ['brief.pdf'],
      imagePaths: [image],
      linkedDirectoryCount: 2,
      mcpServerCount: 1,
    });
    writeFileSync(path.join(f.projectRoot, 'brief.pdf'), 'changed');
    rmSync(image);

    // A restarted daemon hydrates this descriptor from JSON rather than
    // retaining the object that performed the copy.
    const restartedDescriptor = JSON.parse(JSON.stringify(descriptor));
    const loaded = loadOdNextTaskInputSnapshot(restartedDescriptor, f.snapshotsRoot);
    expect(readFileSync(loaded.attachmentPaths[0]!, 'utf8')).toContain('%PDF-1.7');
    expect(readFileSync(loaded.imagePaths[0]!)).toEqual(PNG);
    expect(loaded.requestInputText).toContain('"kind":"file"');
    expect(loaded.requestInputText).toContain('"kind":"image"');
    expect(loaded.requestInputText).toContain('linked-dir:2');
    expect(loaded.requestInputText).toContain('OD_TASK_INPUT_DIR');
    expect(loaded.requestInputText).not.toContain(f.root);
    expect(loaded.taskConfigText).toContain('"taskType":"prototype"');
    expect(loaded.taskConfigText).toContain('"locale":"zh-CN"');
  });

  it('derives type from frozen bytes rather than a deceptive extension', () => {
    const f = fixture();
    writeFileSync(path.join(f.projectRoot, 'not-an-image.png'), 'plain text');
    const descriptor = createOdNextTaskInputSnapshot({
      ...f,
      taskExecutionId: 'odnext_type',
      projectAttachments: ['not-an-image.png'],
    });
    expect(loadOdNextTaskInputSnapshot(descriptor, f.snapshotsRoot).requestInputText)
      .toContain('"mediaType":"text/plain"');
  });

  it('rejects credential-shaped values from the task configuration allowlist', () => {
    expect(() => buildOdNextTaskConfigurationV1({
      taskType: 'prototype',
      selectedAgentId: 'codex',
      model: `sk-${'a'.repeat(24)}`,
      mediaExecution: { mode: 'enabled' },
    })).toThrow(/secret or credential-shaped/);
  });

  it('fails closed on symlink/root escape, TOCTOU, oversize and image type mismatch', () => {
    const f = fixture();
    const outside = path.join(f.root, 'outside.txt');
    writeFileSync(outside, 'outside');
    symlinkSync(outside, path.join(f.projectRoot, 'link.txt'));
    expect(() => createOdNextTaskInputSnapshot({
      ...f,
      taskExecutionId: 'odnext_symlink',
      projectAttachments: ['link.txt'],
    })).toThrow(OdNextTaskInputSnapshotError);
    expect(() => createOdNextTaskInputSnapshot({
      ...f,
      taskExecutionId: 'odnext_escape',
      projectAttachments: ['../outside.txt'],
    })).toThrow(/escapes/);
    expect(() => createOdNextTaskInputSnapshot({
      ...f,
      taskExecutionId: 'odnext_missing',
      projectAttachments: ['missing.txt'],
    })).toThrow(/could not be read and frozen safely/);
    expect(existsSync(path.join(f.snapshotsRoot, 'odnext_missing'))).toBe(false);

    writeFileSync(path.join(f.projectRoot, 'swap.txt'), 'original');
    writeFileSync(path.join(f.projectRoot, 'replacement.txt'), 'replacement');
    expect(() => createOdNextTaskInputSnapshot({
      ...f,
      taskExecutionId: 'odnext_open_swap',
      projectAttachments: ['swap.txt'],
      beforeOpenSource: (source) => {
        renameSync(source, `${source}.old`);
        renameSync(path.join(f.projectRoot, 'replacement.txt'), source);
      },
    })).toThrow(/between path validation and open/);

    writeFileSync(path.join(f.projectRoot, 'race.txt'), 'before');
    expect(() => createOdNextTaskInputSnapshot({
      ...f,
      taskExecutionId: 'odnext_race',
      projectAttachments: ['race.txt'],
      afterReadSource: (source) => writeFileSync(source, 'after-longer'),
    })).toThrow(/changed while/);

    writeFileSync(path.join(f.projectRoot, 'large.txt'), '12345');
    expect(() => createOdNextTaskInputSnapshot({
      ...f,
      taskExecutionId: 'odnext_large',
      projectAttachments: ['large.txt'],
      fileCapBytes: 4,
    })).toThrow(/per-file byte cap/);

    const fakeImage = path.join(f.uploadRoot, 'fake.png');
    writeFileSync(fakeImage, 'not image bytes');
    expect(() => createOdNextTaskInputSnapshot({
      ...f,
      taskExecutionId: 'odnext_fake_image',
      imagePaths: [fakeImage],
    })).toThrow(/not a supported image type/);
  });

  it('replaces partial EEXIST initialization and cleans a failed retry', () => {
    const f = fixture();
    const partial = path.join(f.snapshotsRoot, 'odnext_partial');
    mkdirSync(partial, { recursive: true });
    writeFileSync(path.join(partial, 'partial'), 'stale');
    writeFileSync(path.join(f.projectRoot, 'brief.txt'), 'brief');
    const descriptor = createOdNextTaskInputSnapshot({
      ...f,
      taskExecutionId: 'odnext_partial',
      projectAttachments: ['brief.txt'],
    });
    expect(existsSync(path.join(descriptor.snapshotDir, 'partial'))).toBe(false);
    expect(loadOdNextTaskInputSnapshot(descriptor, f.snapshotsRoot).attachmentPaths)
      .toHaveLength(1);
  });

  it('creates per-Run read-only projections without exposing or mutating canonical bytes', () => {
    const f = fixture();
    writeFileSync(path.join(f.projectRoot, 'brief.pdf'), '%PDF-1.7\ncanonical pdf');
    writeFileSync(path.join(f.projectRoot, 'notes.txt'), 'canonical text');
    const descriptor = createOdNextTaskInputSnapshot({
      ...f,
      taskExecutionId: 'odnext_projection',
      projectAttachments: ['brief.pdf', 'notes.txt'],
    });
    const projectionsRoot = path.join(f.root, 'data', 'run-inputs');
    const first = createOdNextRunInputProjection({
      descriptor,
      snapshotsRoot: f.snapshotsRoot,
      projectionsRoot,
      runId: 'run-1',
    });
    expect(first.attachmentPaths).toHaveLength(2);
    expect(first.attachmentPaths.every((entry) => !entry.startsWith(descriptor.snapshotDir)))
      .toBe(true);
    expect(readFileSync(first.attachmentPaths[0]!, 'utf8')).toContain('canonical pdf');
    expect(readFileSync(first.attachmentPaths[1]!, 'utf8')).toBe('canonical text');
    expect(statSync(first.projectionDir).mode & 0o777).toBe(0o555);
    expect(statSync(first.attachmentPaths[0]!).mode & 0o777).toBe(0o444);

    chmodSync(first.attachmentPaths[1]!, 0o600);
    writeFileSync(first.attachmentPaths[1]!, 'agent mutation');
    const canonical = loadOdNextTaskInputSnapshot(descriptor, f.snapshotsRoot);
    expect(readFileSync(canonical.attachmentPaths[1]!, 'utf8')).toBe('canonical text');

    const restarted = createOdNextRunInputProjection({
      descriptor: JSON.parse(JSON.stringify(descriptor)),
      snapshotsRoot: f.snapshotsRoot,
      projectionsRoot,
      runId: 'run-1',
    });
    expect(readFileSync(restarted.attachmentPaths[1]!, 'utf8')).toBe('canonical text');
    removeOdNextRunInputProjection(restarted);
    expect(existsSync(restarted.projectionDir)).toBe(false);
    expect(existsSync(restarted.projectionAccessRoot)).toBe(false);
    expect(readFileSync(canonical.attachmentPaths[1]!, 'utf8')).toBe('canonical text');
  });

  it('rejects an intermediate attachments-directory symlink even with identical bytes', () => {
    const f = fixture();
    writeFileSync(path.join(f.projectRoot, 'brief.txt'), 'identical frozen bytes');
    const descriptor = createOdNextTaskInputSnapshot({
      ...f,
      taskExecutionId: 'odnext_intermediate_symlink',
      projectAttachments: ['brief.txt'],
    });
    const attachmentsDir = path.join(descriptor.snapshotDir, 'attachments');
    const originalAttachmentsDir = path.join(descriptor.snapshotDir, 'attachments-original');
    const externalAttachmentsDir = path.join(f.root, 'external-attachments');
    renameSync(attachmentsDir, originalAttachmentsDir);
    mkdirSync(externalAttachmentsDir);
    writeFileSync(
      path.join(externalAttachmentsDir, 'attachment-001.txt'),
      readFileSync(path.join(originalAttachmentsDir, 'attachment-001.txt')),
      { mode: 0o400 },
    );
    symlinkSync(externalAttachmentsDir, attachmentsDir, 'dir');

    expect(() => loadOdNextTaskInputSnapshot(descriptor, f.snapshotsRoot))
      .toThrow(/symlink|realpath escapes/);
  });

  it('uses no-follow bounded reads and caps when loading canonical files', () => {
    const f = fixture();
    writeFileSync(path.join(f.projectRoot, 'one.txt'), '12345');
    writeFileSync(path.join(f.projectRoot, 'two.txt'), '67890');
    const descriptor = createOdNextTaskInputSnapshot({
      ...f,
      taskExecutionId: 'odnext_load_guards',
      projectAttachments: ['one.txt', 'two.txt'],
    });
    expect(() => loadOdNextTaskInputSnapshot(descriptor, f.snapshotsRoot, {
      fileCapBytes: 4,
    })).toThrow(/byte cap/);
    expect(() => loadOdNextTaskInputSnapshot(descriptor, f.snapshotsRoot, {
      totalCapBytes: 9,
    })).toThrow(/byte cap/);
    expect(() => loadOdNextTaskInputSnapshot(descriptor, f.snapshotsRoot, {
      countCap: 1,
    })).toThrow(/count exceeds/);
    expect(() => loadOdNextTaskInputSnapshot(descriptor, f.snapshotsRoot, {
      manifestCapBytes: 8,
    })).toThrow(/byte cap/);

    const manifestPath = path.join(descriptor.snapshotDir, 'manifest.json');
    const manifestBytes = readFileSync(manifestPath);
    expect(() => loadOdNextTaskInputSnapshot(
      descriptor,
      f.snapshotsRoot,
      {},
      {
        beforeOpenManifest: (source) => {
          renameSync(source, `${source}.old`);
          writeFileSync(source, manifestBytes, { mode: 0o400 });
        },
      },
    )).toThrow(/between path validation and open/);

    // Restore the original inode path before exercising the attachment swap.
    rmSync(manifestPath);
    renameSync(`${manifestPath}.old`, manifestPath);

    let swappedFrozen = false;
    expect(() => loadOdNextTaskInputSnapshot(
      descriptor,
      f.snapshotsRoot,
      {},
      {
        beforeOpenFile: (source) => {
          if (swappedFrozen) return;
          swappedFrozen = true;
          renameSync(source, `${source}.old`);
          writeFileSync(source, '12345', { mode: 0o400 });
        },
      },
    )).toThrow(/between path validation and open/);
  });

  it('detects manifest, frozen-byte and fact tampering', () => {
    const f = fixture();
    writeFileSync(path.join(f.projectRoot, 'brief.txt'), 'brief');
    const descriptor = createOdNextTaskInputSnapshot({
      ...f,
      taskExecutionId: 'odnext_tamper',
      projectAttachments: ['brief.txt'],
    });
    const frozen = path.join(descriptor.snapshotDir, 'attachments', 'attachment-001.txt');
    chmodSync(frozen, 0o600);
    writeFileSync(frozen, 'tampered');
    expect(() => loadOdNextTaskInputSnapshot(descriptor, f.snapshotsRoot))
      .toThrow(/identity mismatch/);

    const manifest = path.join(descriptor.snapshotDir, 'manifest.json');
    chmodSync(manifest, 0o600);
    writeFileSync(manifest, `${readFileSync(manifest, 'utf8')} `);
    expect(() => loadOdNextTaskInputSnapshot(descriptor, f.snapshotsRoot))
      .toThrow(/manifest digest mismatch/);
  });
});
