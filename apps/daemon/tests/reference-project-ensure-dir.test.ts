// Red-spec for referencing a brand-new (never-generated) project.
//
// A managed project is only a DB row until its first file write — its
// `PROJECTS_DIR/<id>` folder does not exist yet. When such a project is picked
// via "Reference another project", the daemon resolves it to that computed
// path; the composer's existence probe (`/api/dir-exists`) then reports the
// folder missing and the reference is dropped (previously it even blocked the
// whole submission). GET /api/projects/:id?ensureDir=1 fixes this by calling
// ensureReferencedProjectDir, which materializes the managed folder so the
// reference resolves to a real directory. External / imported roots (absolute
// baseDir) are the user's own folders and must never be created here.

import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ensureReferencedProjectDir } from '../src/routes/project/index.js';
import { ensureProject } from '../src/projects.js';

const tempDirs: string[] = [];

function makeProjectsRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'od-ref-ensure-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('ensureReferencedProjectDir', () => {
  it('materializes a managed project folder that has never been written to', async () => {
    const projectsRoot = makeProjectsRoot();
    const project = { id: 'reference-managed', metadata: { kind: 'prototype' } };
    const target = path.join(projectsRoot, project.id);

    expect(existsSync(target)).toBe(false); // brand-new project: no folder yet
    await ensureReferencedProjectDir(projectsRoot, project, ensureProject);
    expect(existsSync(target)).toBe(true); // now referencing resolves to a real dir
  });

  it('materializes a managed project folder even with no metadata', async () => {
    const projectsRoot = makeProjectsRoot();
    const project = { id: 'reference-bare' };
    await ensureReferencedProjectDir(projectsRoot, project, ensureProject);
    expect(existsSync(path.join(projectsRoot, project.id))).toBe(true);
  });

  it('never creates a folder for an imported/external project (absolute baseDir)', async () => {
    const projectsRoot = makeProjectsRoot();
    const externalBase = makeProjectsRoot(); // stand-in for the user's own folder
    const project = { id: 'reference-imported', metadata: { kind: 'prototype', baseDir: externalBase } };

    await ensureReferencedProjectDir(projectsRoot, project, ensureProject);
    // The managed path under projectsRoot must not be conjured up for an
    // external project — its files live in the user's own baseDir.
    expect(existsSync(path.join(projectsRoot, project.id))).toBe(false);
  });

  it('propagates managed folder materialization failures', async () => {
    const projectsRoot = makeProjectsRoot();
    const project = { id: 'reference-managed', metadata: { kind: 'prototype' } };
    const err = new Error('disk full');

    await expect(
      ensureReferencedProjectDir(projectsRoot, project, async () => {
        throw err;
      }),
    ).rejects.toThrow('disk full');
  });
});
