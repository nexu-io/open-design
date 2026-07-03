import type { OkResponse } from '../common.js';
import type { ArtifactKind, ArtifactManifest } from './artifacts.js';

export type ProjectFileKind =
  | 'html'
  | 'image'
  | 'video'
  | 'audio'
  | 'sketch'
  | 'text'
  | 'code'
  | 'pdf'
  | 'document'
  | 'presentation'
  | 'spreadsheet'
  | 'binary';

// Surfaced when the daemon's stub-guard runs in `warn` mode and detects a
// likely regression (the agent emitted a placeholder body that is much
// smaller than a prior artifact sharing the same `metadata.identifier`).
// In `reject` mode the daemon returns `422 ARTIFACT_REGRESSION` instead and
// no `ProjectFile` is produced.
export interface ProjectFileStubGuardWarning {
  code: 'ARTIFACT_REGRESSION';
  message: string;
  identifier: string;
  newSize: number;
  priorSize: number;
  priorName: string;
}

export interface ProjectFile {
  name: string;
  path?: string;
  localPath?: string;
  type?: 'file' | 'dir';
  size: number;
  mtime: number;
  kind: ProjectFileKind;
  mime: string;
  artifactKind?: ArtifactKind;
  artifactManifest?: ArtifactManifest;
  stubGuardWarning?: ProjectFileStubGuardWarning;
  traceObjectReason?: 'new' | 'modified' | 'recovered';
}

export interface ProjectFolder {
  name: string;
  path: string;
  type: 'dir';
  size: 0;
  mtime: number;
}

export interface ProjectFilesResponse {
  files: ProjectFile[];
}

export type ProjectFileVersionSource = 'ai' | 'manual' | 'restore';
export type ProjectFileVersionPromptSource = 'message' | 'project' | 'manual' | 'restore';

export interface ProjectFileVersion {
  id: string;
  fileName: string;
  version: number;
  label: string;
  createdAt: number;
  source: ProjectFileVersionSource;
  prompt: string | null;
  promptSource?: ProjectFileVersionPromptSource;
  restoreFromVersionId?: string;
  size: number;
  mime: string;
  kind: ProjectFileKind;
  current: boolean;
}

export interface ProjectFileVersionsResponse {
  file: ProjectFile;
  versions: ProjectFileVersion[];
}

export interface ProjectFileVersionResponse {
  version: ProjectFileVersion;
  content: string;
}

export interface CreateProjectFileVersionRequest {
  prompt?: string | null;
  label?: string | null;
  source?: ProjectFileVersionSource;
}

export interface CreateProjectFileVersionResponse {
  version: ProjectFileVersion;
}

export interface RestoreProjectFileVersionRequest {
  prompt?: string | null;
}

export interface ProjectFileVersionWarning {
  code: 'PROJECT_FILE_VERSION_CAPTURE_FAILED';
  message: string;
}

export interface RestoreProjectFileVersionResponse {
  file: ProjectFile;
  version: ProjectFileVersion | null;
  versionWarning?: ProjectFileVersionWarning;
}

export interface ProjectFoldersResponse {
  folders: ProjectFolder[];
}

export type ProjectExportManifestFileRole =
  | 'entry'
  | 'artifact'
  | 'supporting'
  | 'asset'
  | 'source'
  | 'other';

export interface ProjectExportManifestFile extends ProjectFile {
  included: boolean;
  role: ProjectExportManifestFileRole;
  reasons: string[];
}

export interface ProjectExportManifestArtifact {
  file: string;
  title: string;
  kind: ArtifactKind | null;
  renderer: string | null;
  status: string | null;
  exports: string[];
  supportingFiles: string[];
  updatedAt: string | null;
}

export const PROJECT_EXPORT_MANIFEST_SCHEMA = 'open-design.project-export-manifest.v1' as const;

export interface ProjectExportManifestResponse {
  schema: typeof PROJECT_EXPORT_MANIFEST_SCHEMA;
  projectId: string;
  projectName: string | null;
  generatedAt: string;
  entryFile: string | null;
  files: ProjectExportManifestFile[];
  artifacts: ProjectExportManifestArtifact[];
}

export interface ProjectPreviewUrlResponse {
  url: string;
  file: string;
  csp: string;
  iframeSandbox: string;
  opaqueOrigin: true;
}

/**
 * Runtime info the web host needs to render a "powered preview" — an HTML
 * artifact that requires real Web Workers, Web Storage, WASM, or (via
 * cross-origin isolation) SharedArrayBuffer, which the default opaque-origin
 * preview sandbox cannot provide.
 *
 * `baseOrigin` is the daemon's own directly-reachable http origin. The web
 * host loads the powered iframe from a host-swapped loopback variant of it.
 * That reserved browser origin is cross-origin to the app shell and is allowed
 * to read `/powered/` file bytes, but the daemon rejects its browser requests
 * to normal `/api/*` routes. `null` when the daemon cannot resolve a usable
 * origin (powered mode is then unavailable and previews stay on the opaque
 * sandbox).
 */
export interface ProjectPreviewIsolationResponse {
  supported: boolean;
  baseOrigin: string | null;
  /** URL path segment for the powered file route (`.../:id/<pathPrefix>/<file>`). */
  pathPrefix: string;
}

export interface ProjectFileResponse {
  file: ProjectFile;
  versionWarning?: ProjectFileVersionWarning;
}

export interface ProjectFileTextPreviewResponse {
  text: string;
  truncated: boolean;
  size: number;
  limit: number;
  mime: string;
  kind: ProjectFileKind;
  poweredPreview: {
    required: boolean;
    scannedBytes: number;
    complete: boolean;
  };
}

export interface ProjectFolderResponse {
  folder: ProjectFolder;
}

export interface UploadProjectFilesResponse extends ProjectFilesResponse {}

export interface DeleteProjectFileResponse extends OkResponse {}

export interface DeleteProjectFolderResponse extends OkResponse {}

export interface RenameProjectFileRequest {
  from: string;
  to: string;
}

export interface RenameProjectFileResponse {
  file: ProjectFile;
  oldName: string;
  newName: string;
}

export function buildProjectRawFileUrl(
  baseUrl: string,
  projectId: string,
  filePath: unknown,
): string | null {
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  const segments = filePath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(encodeURIComponent)
    .join('/');
  if (segments.length === 0) return null;

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  return `${normalizedBaseUrl}/api/projects/${encodeURIComponent(projectId)}/raw/${segments}`;
}

/**
 * Build an absolute powered-preview URL. Same shape as buildProjectRawFileUrl
 * but targets the `/powered/` route (cross-origin-isolation headers) and is
 * meant to be joined against the host-swapped preview origin derived from
 * ProjectPreviewIsolationResponse — NOT a relative path — so the iframe runs
 * at an origin isolated from the app shell and from normal daemon APIs.
 */
export function buildProjectPoweredFileUrl(
  baseOrigin: string,
  projectId: string,
  filePath: unknown,
): string | null {
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  const segments = filePath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(encodeURIComponent)
    .join('/');
  if (segments.length === 0) return null;

  const normalizedBaseUrl = baseOrigin.replace(/\/+$/, '');
  return `${normalizedBaseUrl}/api/projects/${encodeURIComponent(projectId)}/powered/${segments}`;
}
