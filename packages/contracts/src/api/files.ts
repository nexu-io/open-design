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
  type?: 'file' | 'dir';
  size: number;
  mtime: number;
  kind: ProjectFileKind;
  mime: string;
  artifactKind?: ArtifactKind;
  artifactManifest?: ArtifactManifest;
  stubGuardWarning?: ProjectFileStubGuardWarning;
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

export interface ProjectFoldersResponse {
  folders: ProjectFolder[];
}

export type ProjectUiSurfaceKind =
  | 'static-html'
  | 'next-route'
  | 'react-app'
  | 'source-entry'
  | 'unknown';

export type ProjectUiSurfacePreviewStatus =
  | 'live-preview'
  | 'source-mapped'
  | 'needs-setup'
  | 'preview-unavailable';

export type ProjectUiSurfaceConfidence = 'high' | 'medium' | 'low';

export type ProjectUiExternalDependencyKind =
  | 'ui'
  | 'animation'
  | 'icons'
  | 'styling'
  | 'font'
  | 'chart'
  | 'runtime'
  | 'unknown';

export interface ProjectUiExternalDependency {
  packageName: string;
  importPath?: string;
  version?: string;
  kind: ProjectUiExternalDependencyKind;
}

export interface ProjectUiSurface {
  id: string;
  label: string;
  route: string | null;
  kind: ProjectUiSurfaceKind;
  confidence: ProjectUiSurfaceConfidence;
  framework: string | null;
  entryFile: string;
  previewFile: string | null;
  previewRuntimeRoot: string | null;
  previewPath: string | null;
  previewUrl?: string | null;
  previewStatus: ProjectUiSurfacePreviewStatus;
  sourceFiles: string[];
  styleFiles: string[];
  scriptFiles: string[];
  assetFiles: string[];
  fontFiles: string[];
  externalDependencies: ProjectUiExternalDependency[];
  reasons: string[];
  mtime: number;
}

export interface ProjectUiSurfacesResponse {
  surfaces: ProjectUiSurface[];
  generatedAt: string;
}

export interface ProjectUiPreviewRuntimeRequest {
  surfaceId?: string | null;
  entryFile?: string | null;
}

export type ProjectUiPreviewRuntimeStatus =
  | 'ready'
  | 'starting'
  | 'needs-setup'
  | 'unsupported'
  | 'failed';

export interface ProjectUiPreviewRuntimeResponse {
  status: ProjectUiPreviewRuntimeStatus;
  runtimeRoot: string | null;
  baseUrl: string | null;
  url: string | null;
  upstreamBaseUrl?: string | null;
  route: string | null;
  error?: string | null;
  logTail?: string[];
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

export interface ProjectExportManifestResponse {
  schema: 'open-design.project-export-manifest.v1';
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

export interface ProjectFileResponse {
  file: ProjectFile;
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
