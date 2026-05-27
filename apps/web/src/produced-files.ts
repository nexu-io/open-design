import type { ProjectFile } from './types';

/** User-drawn sketch workspace files are not agent turn outputs (#3089). */
export function isUserSketchProjectFile(file: ProjectFile): boolean {
  return file.kind === 'sketch';
}

export function filterAgentAttributedProjectFiles(
  files: readonly ProjectFile[],
): ProjectFile[] {
  return files.filter((file) => !isUserSketchProjectFile(file));
}
