import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { stageProjectDirsForDelete } from '../src/projects.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('project delete staging', () => {
  it('rolls back already staged directories when a later project id fails', async () => {
    const root = path.join(tmpdir(), `od-delete-staging-${Date.now()}-${Math.random()}`);
    roots.push(root);
    const firstProjectDir = path.join(root, 'project-a');
    mkdirSync(firstProjectDir, { recursive: true });
    writeFileSync(path.join(firstProjectDir, 'index.html'), '<p>still here</p>');

    await expect(
      stageProjectDirsForDelete(root, ['project-a', '../bad'], 'batch-1'),
    ).rejects.toThrow('invalid project id');

    expect(existsSync(firstProjectDir)).toBe(true);
    expect(existsSync(path.join(firstProjectDir, 'index.html'))).toBe(true);
    expect(existsSync(path.join(root, '.delete-staging', 'batch-1', 'project-a'))).toBe(false);
  });
});
