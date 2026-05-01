import type { JsonValue } from '../common';

export type ArtifactKind =
  | 'html'
  | 'deck'
  | 'react-component'
  | 'markdown-document'
  | 'svg'
  | 'diagram'
  | 'code-snippet'
  | 'mini-app'
  | 'design-system';

export type ArtifactRendererId =
  | 'html'
  | 'deck-html'
  | 'react-component'
  | 'markdown'
  | 'svg'
  | 'diagram'
  | 'code'
  | 'mini-app'
  | 'design-system';

export type ArtifactExportKind = 'html' | 'pdf' | 'zip' | 'pptx' | 'jsx' | 'md' | 'svg' | 'txt';

export type ArtifactStatus = 'streaming' | 'complete' | 'error';

export interface ArtifactManifest {
  version: 1;
  kind: ArtifactKind;
  title: string;
  entry: string;
  renderer: ArtifactRendererId;
  /**
   * Optional for backward compatibility with pre-streaming artifacts.
   * Daemon/web manifest normalization defaults missing values to "complete".
   */
  status?: ArtifactStatus;
  exports: ArtifactExportKind[];
  supportingFiles?: string[];
  createdAt?: string;
  updatedAt?: string;
  sourceSkillId?: string;
  designSystemId?: string | null;
  metadata?: Record<string, JsonValue | undefined>;
}

export interface SaveArtifactRequest {
  identifier: string;
  title: string;
  html: string;
}

export interface SaveArtifactResponse {
  url: string;
  path: string;
}
