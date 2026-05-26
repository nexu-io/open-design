import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  classifyMediaProjectRunCloseStatus,
  mediaDeliverableMissingMessage,
} from '../src/media-deliverable-guard.js';
import {
  finalizeMediaTaskFromGenerateResult,
  verifyMediaOutputOnDisk,
} from '../src/media.js';

describe('classifyMediaProjectRunCloseStatus (#2892)', () => {
  it('keeps non-media project runs unchanged', () => {
    expect(
      classifyMediaProjectRunCloseStatus({
        status: 'succeeded',
        projectKind: 'prototype',
        hasDeliverableFile: false,
      }),
    ).toBe('succeeded');
  });

  it('downgrades succeeded video runs when no video file exists', () => {
    expect(
      classifyMediaProjectRunCloseStatus({
        status: 'succeeded',
        projectKind: 'video',
        hasDeliverableFile: false,
      }),
    ).toBe('failed');
  });

  it('preserves succeeded video runs when a video file exists', () => {
    expect(
      classifyMediaProjectRunCloseStatus({
        status: 'succeeded',
        projectKind: 'video',
        hasDeliverableFile: true,
      }),
    ).toBe('succeeded');
  });

  it('does not rewrite canceled or failed statuses', () => {
    expect(
      classifyMediaProjectRunCloseStatus({
        status: 'canceled',
        projectKind: 'video',
        hasDeliverableFile: false,
      }),
    ).toBe('canceled');
    expect(
      classifyMediaProjectRunCloseStatus({
        status: 'failed',
        projectKind: 'video',
        hasDeliverableFile: true,
      }),
    ).toBe('failed');
  });
});

describe('mediaDeliverableMissingMessage', () => {
  it('names the missing project kind', () => {
    expect(mediaDeliverableMissingMessage('video')).toContain('video');
    expect(mediaDeliverableMissingMessage('video')).toContain('media wait');
  });
});

describe('verifyMediaOutputOnDisk (#2892)', () => {
  let tmpRoot = '';

  afterEach(async () => {
    if (tmpRoot) {
      await rm(tmpRoot, { recursive: true, force: true });
      tmpRoot = '';
    }
  });

  it('accepts a non-empty on-disk file that matches metadata', async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'od-media-verify-'));
    const projectId = 'project-1';
    const projectDir = path.join(tmpRoot, projectId);
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'clip.mp4'), Buffer.from('fake-video'));

    await expect(
      verifyMediaOutputOnDisk(tmpRoot, projectId, {
        name: 'clip.mp4',
        size: 10,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects missing output files', async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'od-media-verify-'));
    const projectId = 'project-1';
    await mkdir(path.join(tmpRoot, projectId), { recursive: true });

    await expect(
      verifyMediaOutputOnDisk(tmpRoot, projectId, { name: 'clip.mp4', size: 10 }),
    ).rejects.toThrow(/not a file|ENOENT/);
  });

  it('marks media tasks failed when verification fails', async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'od-media-verify-'));
    const projectId = 'project-1';
    await mkdir(path.join(tmpRoot, projectId), { recursive: true });
    const task: {
      status: string;
      file: { name?: string; size?: number } | null;
      error: { message: string; status: number; code?: string } | null;
      endedAt: number | null;
    } = {
      status: 'running',
      file: null,
      error: null,
      endedAt: null,
    };

    const outcome = await finalizeMediaTaskFromGenerateResult(
      task,
      { name: 'clip.mp4', size: 10 },
      tmpRoot,
      projectId,
    );

    expect(outcome).toBe('failed');
    expect(task.status).toBe('failed');
    expect(task.error?.code).toBe('MEDIA_OUTPUT_MISSING');
    expect(task.file).toBeNull();
    expect(task.endedAt).toBeTypeOf('number');
  });
});
