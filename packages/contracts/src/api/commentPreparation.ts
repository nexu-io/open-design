import type { ProjectFileVersion } from './files.js';

/** Explicit source edit. The caller must first settle local drafts and generation. */
export interface PrepareCommentIdentityRequest {
  expectedSource: string;
  editingSettled: true;
}
export interface PrepareCommentIdentityResponse {
  source: string;
  changed: boolean;
  preparedTargets: number;
  version: ProjectFileVersion;
}
