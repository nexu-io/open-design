import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createProjectFileVersion,
  getProjectFileVersionRootStats,
  listProjectFileVersions,
  readProjectFileVersion,
} from '../src/project-file-versions.js';
import { ensureProject } from '../src/projects.js';

describe('project file version manifest publication', () => {
  let projectsRoot: string;
  const projectId = 'versioned-project';
  const fileName = 'brand.html';
  const firstContent = '<html>first</html>';
  const nextContent = '<html>next</html>';

  beforeEach(async () => {
    projectsRoot = await mkdtemp(path.join(tmpdir(), 'od-version-atomic-'));
    await ensureProject(projectsRoot, projectId);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    syncBuiltinESMExports();
    await rm(projectsRoot, { recursive: true, force: true });
  });

  const create = (content: string) => createProjectFileVersion(projectsRoot, projectId, fileName, content);
  const list = () => listProjectFileVersions(projectsRoot, projectId, fileName);
  const isManifest = (file: unknown) => path.basename(String(file)).startsWith('manifest.json');
  const expectNoTemporaryFiles = async () => {
    const { entries } = await getProjectFileVersionRootStats(projectsRoot, projectId, fileName);
    expect(entries.filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
  };

  it.each([false, true])('keeps history readable and retryable after a partial write (existing: %s)', async (existing) => {
    const first = existing ? await create(firstContent) : null;
    const writeFile = fs.promises.writeFile;
    const write = vi.spyOn(fs.promises, 'writeFile').mockImplementation(async (file, data, options) => {
      if (isManifest(file)) {
        await writeFile(file, '{', options);
        throw Object.assign(new Error('partial manifest write'), { code: 'EIO' });
      }
      await writeFile(file, data, options);
    });
    syncBuiltinESMExports();
    await expect(create(nextContent)).rejects.toMatchObject({ code: 'EIO' });
    write.mockRestore();
    syncBuiltinESMExports();

    expect((await list()).map((version) => version.id)).toEqual(first ? [first.id] : []);
    if (first) {
      expect((await readProjectFileVersion(projectsRoot, projectId, fileName, first.id)).content).toBe(firstContent);
    }
    await expectNoTemporaryFiles();
    expect((await create(nextContent)).version).toBe(first ? 2 : 1);
  });

  it('serves the last complete checkpoint while a new manifest is being written', async () => {
    const first = await create(firstContent);
    const writeFile = fs.promises.writeFile;
    let markEntered!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { markEntered = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(fs.promises, 'writeFile').mockImplementation(async (file, data, options) => {
      if (isManifest(file)) {
        await writeFile(file, '{', options);
        markEntered();
        await held;
      }
      await writeFile(file, data, options);
    });
    syncBuiltinESMExports();
    const saving = create(nextContent);
    await entered;
    try {
      expect((await list()).map((version) => version.id)).toEqual([first.id]);
    } finally {
      release();
      await saving;
    }
    expect((await list()).map((version) => version.current)).toEqual([false, true]);
    await expectNoTemporaryFiles();
  });

  it('retains the prior checkpoint and cleans staging when manifest rename fails', async () => {
    const first = await create(firstContent);
    const rename = fs.promises.rename;
    vi.spyOn(fs.promises, 'rename').mockImplementation(async (source, target) => {
      if (path.basename(String(target)) === 'manifest.json') {
        throw Object.assign(new Error('manifest rename failed'), { code: 'EIO' });
      }
      await rename(source, target);
    });
    syncBuiltinESMExports();
    await expect(create(nextContent)).rejects.toMatchObject({ code: 'EIO' });
    expect((await list()).map((version) => version.id)).toEqual([first.id]);
    await expectNoTemporaryFiles();
  });
});
