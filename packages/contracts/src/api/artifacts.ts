import type { JsonValue } from '../common.js';

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

// Plan §3.N3 / spec §11.5.1 — plugin provenance + downstream
// distribution. Every field is optional for back-compat; readers
// MUST preserve unknown values.

export type ArtifactProvenanceTaskKind =
  | 'new-generation'
  | 'code-migration'
  | 'figma-migration'
  | 'tune-collab';

export type ArtifactProvenanceArtifactKind =
  | 'html-prototype'
  | 'deck'
  | 'interactive-video'
  | 'design-system'
  | 'code-diff'
  | 'production-app'
  | 'asset-pack';

export type ArtifactProvenanceRenderKind =
  | 'html'
  | 'jsx'
  | 'pptx'
  | 'markdown'
  | 'video'
  | 'image'
  | 'diff'
  | 'repo';

export type ArtifactProvenanceHandoffKind =
  | 'design-only'
  | 'implementation-plan'
  | 'patch'
  | 'deployable-app';

export type ArtifactExportSurface =
  | 'cli'
  | 'desktop'
  | 'web'
  | 'docker'
  | 'github'
  | 'figma'
  | 'code-agent';

export type ArtifactDeployProvider =
  | 'aws'
  | 'gcp'
  | 'azure'
  | 'aliyun'
  | 'tencent'
  | 'huawei'
  | 'self-hosted';

export interface ArtifactExportTarget {
  surface:    ArtifactExportSurface;
  target:     string;
  exportedAt: number;
}

export interface ArtifactDeployTarget {
  provider:    ArtifactDeployProvider;
  location:    string;
  deployedAt:  number;
}

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

  // Plan §3.N3 / spec §11.5.1 — plugin provenance + downstream
  // distribution. Optional in v1; unknown readers must preserve.
  sourcePluginSnapshotId?: string;
  sourcePluginId?: string;
  sourcePluginVersion?: string;
  sourceTaskKind?: ArtifactProvenanceTaskKind;
  sourceRunId?: string;
  sourceProjectId?: string;
  parentArtifactId?: string;

  artifactKind?: ArtifactProvenanceArtifactKind;
  renderKind?:   ArtifactProvenanceRenderKind;
  handoffKind?:  ArtifactProvenanceHandoffKind;

  exportTargets?: ArtifactExportTarget[];
  deployTargets?: ArtifactDeployTarget[];
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
