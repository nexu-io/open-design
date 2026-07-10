/**
 * Contracts for editing an existing application through Open Design.
 *
 * The target application publishes this manifest from its development server.
 * Open Design only applies edits declared by the manifest; the browser cannot
 * submit arbitrary file paths, search strings, or commands.
 */

export const REPO_STUDIO_PROTOCOL_VERSION = 1 as const;

export type RepoStudioControlValue = string | number | boolean;

export type RepoStudioControlOption = {
  value: RepoStudioControlValue;
  label: string;
  /** Exact source token used for this option inside the marker window. */
  sourceToken: string;
};

export type RepoStudioControl = {
  id: string;
  label: string;
  kind: 'select' | 'number' | 'boolean';
  value: RepoStudioControlValue;
  options: RepoStudioControlOption[];
  edit: {
    /** Project-relative source file. */
    file: string;
    /** Marker comment that scopes the exact-token replacement. */
    marker: string;
    /** Maximum number of characters after the marker that may be edited. */
    windowChars?: number;
  };
};

export type RepoStudioComponent = {
  id: string;
  label: string;
  /** Selector used by the live-preview bridge. */
  selector: string;
  sourceFile: string;
  controls: RepoStudioControl[];
};

export type RepoStudioVerification = {
  id: string;
  label: string;
  command: string;
  args: string[];
  timeoutMs?: number;
};

export type RepoStudioManifest = {
  protocolVersion: typeof REPO_STUDIO_PROTOCOL_VERSION;
  appId: string;
  appName: string;
  previewUrl: string;
  components: RepoStudioComponent[];
  verification: RepoStudioVerification[];
};

export type RepoStudioInspectRequest = {
  root: string;
  manifestUrl: string;
};

export type RepoStudioInspectResponse = {
  root: string;
  manifestUrl: string;
  manifest: RepoStudioManifest;
};

export type RepoStudioApplyRequest = RepoStudioInspectRequest & {
  componentId: string;
  controlId: string;
  value: RepoStudioControlValue;
};

export type RepoStudioApplyResponse = {
  ok: true;
  file: string;
  componentId: string;
  controlId: string;
  previousValue: RepoStudioControlValue;
  value: RepoStudioControlValue;
  beforeSnippet: string;
  afterSnippet: string;
};

export type RepoStudioVerifyRequest = RepoStudioInspectRequest & {
  verificationId: string;
};

export type RepoStudioVerifyResponse = {
  ok: boolean;
  verificationId: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type RepoStudioDiffRequest = RepoStudioInspectRequest;

export type RepoStudioDiffResponse = {
  clean: boolean;
  files: string[];
  diff: string;
};
