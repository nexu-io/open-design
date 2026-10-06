// The switcher is the one place the open project is named (OPEND-3128), so it
// must carry the catalog-title authority the chat card's title used to carry:
// a shared project opened by another member shows the catalog name, not the
// local mirror's stale one (e2e "successful first-open materialization").

import { describe, expect, it } from 'vitest';

import { projectsForWorkspaceChrome } from '../../src/runtime/workspace-chrome-projects';
import type { Project } from '../../src/types';

function project(overrides: Partial<Project>): Project {
  return {
    id: 'p-1',
    name: 'Local name',
    skillId: null,
    designSystemId: null,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe('projectsForWorkspaceChrome', () => {
  it('names the open project by the catalog authority over its local mirror name', () => {
    const mirror = project({ id: 'p-remote', name: 'Stale pulled title' });
    const other = project({ id: 'p-other', name: 'Other' });

    const rows = projectsForWorkspaceChrome({
      projects: [other, mirror],
      activeProject: mirror,
      activeProjectId: 'p-remote',
      authoritativeProjectName: 'Catalog-owned launch artifact',
    });

    expect(rows.map((row) => row.name)).toEqual(['Other', 'Catalog-owned launch artifact']);
    // Only the name is overlaid; the row keeps its binding fields.
    expect(rows[1]).toMatchObject({ id: 'p-remote', updatedAt: 2 });
  });

  it('leaves every row alone without an authority, and returns the same array', () => {
    const projects = [project({ id: 'p-1' })];
    expect(
      projectsForWorkspaceChrome({
        projects,
        activeProject: projects[0]!,
        activeProjectId: 'p-1',
        authoritativeProjectName: undefined,
      }),
    ).toBe(projects);
    expect(
      projectsForWorkspaceChrome({
        projects,
        activeProject: projects[0]!,
        activeProjectId: 'p-1',
        authoritativeProjectName: '   ',
      }),
    ).toBe(projects);
  });

  it('appends a deep-linked project the ambient list has not loaded, with the authority applied', () => {
    const deepLinked = project({ id: 'p-deep', name: 'Placeholder' });
    const rows = projectsForWorkspaceChrome({
      projects: [project({ id: 'p-1' })],
      activeProject: deepLinked,
      activeProjectId: 'p-deep',
      authoritativeProjectName: 'Catalog name',
    });
    expect(rows.map((row) => [row.id, row.name])).toEqual([
      ['p-1', 'Local name'],
      ['p-deep', 'Catalog name'],
    ]);
  });

  it('never renames a project that is not the open one', () => {
    const rows = projectsForWorkspaceChrome({
      projects: [project({ id: 'p-1' }), project({ id: 'p-2', name: 'Two' })],
      activeProject: null,
      activeProjectId: 'p-2',
      authoritativeProjectName: 'Catalog two',
    });
    expect(rows.map((row) => row.name)).toEqual(['Local name', 'Catalog two']);
  });
});
