import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  propagateWorkspaceProjectRename,
  workspaceRenameDesignSystemId,
} from '../../src/design-systems/index.js';

// Renaming a design-system workspace project used to revert silently:
// ensureUserDesignSystemWorkspaceProject re-stamps the project name from
// the registry title on every workspace open, so a rename applied only to
// the project row was overwritten by the stale title. The fix writes the
// rename through to the design-system title; these tests pin that
// write-through and the predicate that gates it.

const DIR_ID = 'trip-journal-design-system';
const DS_ID = `user:${DIR_ID}`;

describe('workspaceRenameDesignSystemId', () => {
  const workspaceProject = {
    designSystemId: DS_ID,
    metadata: { importedFrom: 'design-system' },
  };

  it('returns the design-system id for a workspace project', () => {
    expect(workspaceRenameDesignSystemId(workspaceProject)).toBe(DS_ID);
  });

  it('ignores projects bound to non-user design systems', () => {
    expect(
      workspaceRenameDesignSystemId({ ...workspaceProject, designSystemId: 'agentic' }),
    ).toBeNull();
  });

  it('ignores projects that are not design-system workspaces', () => {
    expect(
      workspaceRenameDesignSystemId({ ...workspaceProject, metadata: { importedFrom: 'folder' } }),
    ).toBeNull();
    expect(
      workspaceRenameDesignSystemId({ ...workspaceProject, metadata: undefined }),
    ).toBeNull();
  });

  it('ignores projects without a design-system binding', () => {
    expect(
      workspaceRenameDesignSystemId({ designSystemId: null, metadata: { importedFrom: 'design-system' } }),
    ).toBeNull();
  });
});

describe('propagateWorkspaceProjectRename', () => {
  let root = '';
  const project = {
    designSystemId: DS_ID,
    metadata: { importedFrom: 'design-system' },
  };

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-ds-rename-'));
    const dir = path.join(root, DIR_ID);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'DESIGN.md'),
      '# Trip Journal\n\n> Category: Project Design System\n> Surface: web\n\nBody text.\n',
      'utf8',
    );
    await writeFile(
      path.join(dir, 'metadata.json'),
      JSON.stringify(
        {
          title: 'Trip Journal',
          category: 'Project Design System',
          surface: 'web',
          status: 'draft',
          artifactMode: 'agent-managed',
          projectId: 'proj-1',
        },
        null,
        2,
      ),
      'utf8',
    );
  });

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('writes the new name through to the design-system title and heading', async () => {
    const propagated = await propagateWorkspaceProjectRename(root, project, 'Earth Postcard');
    expect(propagated).toBe(true);

    const metadata = JSON.parse(
      await readFile(path.join(root, DIR_ID, 'metadata.json'), 'utf8'),
    ) as { title?: string };
    expect(metadata.title).toBe('Earth Postcard');

    const designMd = await readFile(path.join(root, DIR_ID, 'DESIGN.md'), 'utf8');
    expect(designMd.startsWith('# Earth Postcard')).toBe(true);
    // The body must survive a rename — only the header changes.
    expect(designMd).toContain('Body text.');
  });

  it('trims the propagated name', async () => {
    expect(await propagateWorkspaceProjectRename(root, project, '  Earth Postcard  ')).toBe(true);
    const metadata = JSON.parse(
      await readFile(path.join(root, DIR_ID, 'metadata.json'), 'utf8'),
    ) as { title?: string };
    expect(metadata.title).toBe('Earth Postcard');
  });

  it('does nothing for blank names or non-workspace projects', async () => {
    expect(await propagateWorkspaceProjectRename(root, project, '   ')).toBe(false);
    expect(await propagateWorkspaceProjectRename(root, project, undefined)).toBe(false);
    expect(
      await propagateWorkspaceProjectRename(
        root,
        { designSystemId: DS_ID, metadata: { importedFrom: 'folder' } },
        'Earth Postcard',
      ),
    ).toBe(false);

    const metadata = JSON.parse(
      await readFile(path.join(root, DIR_ID, 'metadata.json'), 'utf8'),
    ) as { title?: string };
    expect(metadata.title).toBe('Trip Journal');
  });

  it('returns false when the design-system entry does not exist', async () => {
    expect(
      await propagateWorkspaceProjectRename(
        root,
        { designSystemId: 'user:missing-entry', metadata: { importedFrom: 'design-system' } },
        'Earth Postcard',
      ),
    ).toBe(false);
  });
});
