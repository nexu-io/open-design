// Transport home for project-file listing, live-artifact listing, and
// artifact-text persistence — all daemon `registry` calls the project-files
// & artifacts cluster needs.
import {
  fetchProjectFiles as fetchProjectFilesTransport,
  fetchLiveArtifacts as fetchLiveArtifactsTransport,
  writeProjectTextFile as writeProjectTextFileTransport,
} from '../registry';
import type { LiveArtifactSummary, ProjectFile } from '../../types';
import type { ArtifactManifest } from '../../artifacts/types';

/** List a project's files. Best-effort: resolves `[]` on failure. */
export async function fetchProjectFiles(projectId: string): Promise<ProjectFile[]> {
  return fetchProjectFilesTransport(projectId);
}

/** List a project's live artifacts. Best-effort: resolves `[]` on failure. */
export async function fetchLiveArtifacts(projectId: string): Promise<LiveArtifactSummary[]> {
  return fetchLiveArtifactsTransport(projectId);
}

/** Write a project text file (e.g. a persisted HTML artifact). Resolves
 *  `null` on failure. */
export async function writeProjectTextFile(
  projectId: string,
  name: string,
  content: string,
  options?: { artifactManifest?: ArtifactManifest },
): Promise<ProjectFile | null> {
  return writeProjectTextFileTransport(projectId, name, content, options);
}
