import type { DesignSystemSummary, Project } from '../types';

function hasBrandExtractionDesignSystemMetadata(project: Project): boolean {
  return (
    project.metadata?.importedFrom === 'brand-extraction' ||
    project.metadata?.kind === 'brand' ||
    Boolean(project.metadata?.brandDesignSystemId)
  );
}

/** A project imported from / backing a design system. */
export function isDesignSystemProject(project: Project): boolean {
  return (
    project.metadata?.importedFrom === 'design-system' ||
    hasBrandExtractionDesignSystemMetadata(project)
  );
}

/**
 * The project-level designSystemId is the normal active design-system context.
 * Brand extraction projects stamp their canonical generated system in metadata,
 * so prefer that backing id when present.
 */
export function resolveProjectDesignSystemId(project: Project): string | null {
  const brandDesignSystemId = project.metadata?.brandDesignSystemId?.trim() || null;
  if (brandDesignSystemId && hasBrandExtractionDesignSystemMetadata(project)) {
    return brandDesignSystemId;
  }
  return project.designSystemId ?? brandDesignSystemId;
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
  const designSystemId = resolveProjectDesignSystemId(project);
  if (!isDesignSystemProject(project) || !designSystemId) return false;
  return designSystems.some(
    (system) => system.id === designSystemId && system.status === 'published',
  );
}
