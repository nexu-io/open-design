import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, test } from 'vitest';

import { stageAmrImagePaths } from '../src/media/amr-image-staging.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test('stageAmrImagePaths rejects upload symlinks that resolve outside the upload root', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'od-amr-stage-'));
  tempDirs.push(root);
  const projectDir = path.join(root, 'project');
  const uploadRoot = path.join(root, 'uploads');
  const outsideDir = path.join(root, 'outside');
  await Promise.all([
    mkdir(projectDir, { recursive: true }),
    mkdir(uploadRoot, { recursive: true }),
    mkdir(outsideDir, { recursive: true }),
  ]);
  const outsideFile = path.join(outsideDir, 'secret.png');
  const symlinkPath = path.join(uploadRoot, 'escape.png');
  await writeFile(outsideFile, 'not-an-image');
  await symlink(outsideFile, symlinkPath);

  await expect(
    stageAmrImagePaths(projectDir, [symlinkPath], uploadRoot),
  ).resolves.toEqual([]);
});
