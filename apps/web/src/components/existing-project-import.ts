import type { ProjectMetadata } from '../types';

export function isExistingProjectImport(metadata: ProjectMetadata | undefined | null): boolean {
  return metadata?.importedFrom === 'folder' || metadata?.importedFrom === 'project-location';
}
