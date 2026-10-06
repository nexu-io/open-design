import type { Project } from '../types';

/**
 * The rows the workspace tabs chrome names its project tabs from.
 *
 * Two rules, both about the OPEN project:
 * - a deep-linked project the ambient list has not loaded yet is appended so
 *   its tab has a name — never inserted into the ambient Home catalogue;
 * - the open project wears the catalog-title authority ProjectView applies
 *   through `reconcileProjectDetail`: another member's catalog row outranks a
 *   stale local mirror name. The switcher is the one place the project is
 *   named (OPEND-3128), so it must not read the local placeholder ("Stale
 *   pulled title") while the catalog says otherwise — the chat card's own
 *   title used to hide that gap.
 */
export function projectsForWorkspaceChrome(input: {
  projects: Project[];
  activeProject: Project | null;
  activeProjectId: string | null;
  authoritativeProjectName: string | null | undefined;
}): Project[] {
  const { projects, activeProject, activeProjectId } = input;
  const rows =
    activeProject && !projects.some((project) => project.id === activeProject.id)
      ? [...projects, activeProject]
      : projects;
  const authoritativeName = input.authoritativeProjectName?.trim() || null;
  if (!activeProjectId || !authoritativeName) return rows;
  return rows.map((project) =>
    project.id === activeProjectId && project.name !== authoritativeName
      ? { ...project, name: authoritativeName }
      : project,
  );
}
