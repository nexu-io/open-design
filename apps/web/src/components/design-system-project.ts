import type { DesignSystemSummary, Project } from '../types';

/** A project imported from / backing a design system. */
export function isDesignSystemProject(project: Project): boolean {
  return project.metadata?.importedFrom === 'design-system';
}

/**
 * True when a project is a design system whose backing system is published.
 * The publish state lives on the DesignSystemSummary (keyed by designSystemId),
 * not on the project's run status, so a published system whose last generation
 * run failed should still read as published in project cards.
 */
export function isPublishedDesignSystemProject(
  project: Project,
  designSystems: readonly DesignSystemSummary[],
): boolean {
  if (!isDesignSystemProject(project) || !project.designSystemId) return false;
  return designSystems.some(
    (system) => system.id === project.designSystemId && system.status === 'published',
  );
}
