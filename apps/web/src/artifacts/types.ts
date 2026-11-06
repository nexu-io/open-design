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

export type ArtifactExportKind =
  | 'html'
  | 'pdf'
  | 'zip'
  | 'jsx'
  | 'md'
  | 'svg'
  | 'txt';

export type ArtifactStatus = 'streaming' | 'complete' | 'error';

export interface ArtifactManifest {
  version: 1;
  kind: ArtifactKind;
  title: string;
  entry: string;
  renderer: ArtifactRendererId;
  // Optional for backward compatibility with older manifests.
  // Frontend + daemon normalize missing status to "complete".
  status?: ArtifactStatus;
  exports: ArtifactExportKind[];
  /**
   * Optional primary entry hint for multi-file outputs. When omitted, clients
   * may fall back to renderable-file heuristics.
   */
  primary?: string | boolean;
  /**
   * Reserved for future multi-file artifact packaging.
   * Current generators only persist a single entry file, so this is not yet populated.
   */
  supportingFiles?: string[];
  createdAt?: string;
  updatedAt?: string;
  sourceSkillId?: string;
  designSystemId?: string | null;
  metadata?: Record<string, unknown>;
}
