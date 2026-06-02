import type { ProjectFile } from './types';

// Implicit attribution is based on project-file timing or pre/post file-list
// diffs. User-created sketches can change during a run, but that does not make
// them assistant output files unless a run records them explicitly.
export function isImplicitProducedFileCandidate(file: ProjectFile): boolean {
  const lowerPath = (file.path ?? file.name).toLowerCase();
  return !lowerPath.endsWith('.sketch.json');
}

export function filterImplicitProducedFiles(files: readonly ProjectFile[]): ProjectFile[] {
  return files.filter(isImplicitProducedFileCandidate);
}
