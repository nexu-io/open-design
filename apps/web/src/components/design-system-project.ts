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
 * Human-readable label for what a design-system project was extracted from,
 * used in the synthesized "Extract the design system from <source>" turn.
 * Prefers the source website's bare hostname, then the stored source file name,
 * and finally a caller-supplied fallback (typically the system title).
 */
export function designSystemExtractionSource(project: Project, fallback: string): string {
  const url = project.metadata?.brandSourceUrl?.trim();
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }
  const file = project.metadata?.sourceFileName?.trim();
  if (file) return file;
  return fallback;
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
