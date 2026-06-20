import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { generateMedia } from '../../src/media/index.js';

describe('hyperframes-html media renderer preflight', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  const originalAllowStubs = process.env.OD_MEDIA_ALLOW_STUBS;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-hyperframes-media-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    await mkdir(path.join(projectsRoot, 'project-1'), { recursive: true });
    process.env.OD_MEDIA_ALLOW_STUBS = '1';
  });

  afterEach(async () => {
    if (originalAllowStubs == null) {
      delete process.env.OD_MEDIA_ALLOW_STUBS;
    } else {
      process.env.OD_MEDIA_ALLOW_STUBS = originalAllowStubs;
    }
    await rm(root, { recursive: true, force: true });
  });

  it('rejects incomplete composition dirs instead of falling back to a stub', async () => {
    const compRel = '.hyperframes-cache/incomplete';
    const compDir = path.join(projectsRoot, 'project-1', compRel);
    await mkdir(compDir, { recursive: true });
    await writeFile(path.join(compDir, 'index.html'), '<!doctype html><div id="root"></div>', 'utf8');

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'hyperframes-html',
      output: 'test.mp4',
      compositionDir: compRel,
    })).rejects.toThrow(/compositionDir is missing hyperframes\.json/);
  });

  it('requires meta.json before spawning the local renderer', async () => {
    const compRel = '.hyperframes-cache/no-meta';
    const compDir = path.join(projectsRoot, 'project-1', compRel);
    await mkdir(compDir, { recursive: true });
    await writeFile(path.join(compDir, 'hyperframes.json'), '{}', 'utf8');
    await writeFile(path.join(compDir, 'index.html'), '<!doctype html><div id="root"></div>', 'utf8');

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'video',
      model: 'hyperframes-html',
      output: 'test.mp4',
      compositionDir: compRel,
    })).rejects.toThrow(/compositionDir is missing meta\.json/);
  });
});
