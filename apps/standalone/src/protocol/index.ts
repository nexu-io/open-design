import { createHash } from "node:crypto";
import { isAbsolute, posix, win32 } from "node:path";

import { isReleaseChannel, type ReleaseChannel } from "@open-design/release";

export const STANDALONE_PROTOCOL_VERSION = 1 as const;
export const STANDALONE_BOOTSTRAP_SCHEMA_VERSION = 1 as const;
export const STANDALONE_BOOTSTRAP_PROGRESS_SCHEMA_VERSION = 1 as const;
export const STANDALONE_BOOTSTRAP_RESULT_SCHEMA_VERSION = 1 as const;
export const STANDALONE_HANDOFF_SCHEMA_VERSION = 1 as const;
export const STANDALONE_UPDATER_SCHEMA_VERSION = 1 as const;
export const STANDALONE_BOOTLOADER_ENTRY_PATH = "bootloader.mjs" as const;
export const STANDALONE_BOOTLOADER_EXPORT_NAME = "handoff" as const;

export type StandaloneDigest = `sha256:${string}`;

export type StandaloneBootstrapScope = Readonly<{
  channel: ReleaseChannel;
  namespace: string;
}>;

export type StandaloneHandoffScope = Readonly<{
  channel: ReleaseChannel;
  generation: number;
  namespace: string;
}>;

export type StandaloneRuntimeDescriptor = Readonly<{
  release: Readonly<{
    version: string;
  }>;
  standalone: Readonly<{
    digest: StandaloneDigest;
    protocolVersion: typeof STANDALONE_PROTOCOL_VERSION;
    version: string;
  }>;
}>;

export type StandaloneShellDescriptor = Readonly<{
  digest: StandaloneDigest;
  type: string;
  version: string;
}>;

export type StandaloneAttachmentDescriptor = Readonly<{
  id: string;
  shell: StandaloneShellDescriptor;
}>;

export type StandaloneHandoffEnvelope = Readonly<{
  descriptor: StandaloneRuntimeDescriptor;
  descriptorDigest: StandaloneDigest;
  schemaVersion: typeof STANDALONE_HANDOFF_SCHEMA_VERSION;
  scope: StandaloneHandoffScope;
}>;

export type StandalonePaths = Readonly<{
  cacheRoot: string;
  dataRoot: string;
  installationRoot: string;
  logsRoot: string;
  resourceRoot: string;
  runtimeRoot: string;
}>;

export type StandaloneBootstrapDescriptor = Readonly<{
  attachment: StandaloneAttachmentDescriptor;
  discovery: Readonly<{
    metadataUrl: string | null;
    target: string;
  }>;
  paths: StandalonePaths;
  /** Product release requested by the launcher; independent from Shell bytes. */
  releaseVersion: string;
  repositoryConfigPath: string;
  schemaVersion: typeof STANDALONE_BOOTSTRAP_SCHEMA_VERSION;
  scope: StandaloneBootstrapScope;
}>;

export type StandaloneBootstrapRequest = StandaloneBootstrapDescriptor & Readonly<{
  capabilities: StandaloneShellCapabilityPort;
}>;

export type StandaloneBootstrapResolution = Readonly<{
  bootloaderPath: string;
  handoff: StandaloneHandoffDescriptor;
}>;

export const STANDALONE_BOOTSTRAP_PROGRESS_STAGES = Object.freeze([
  "checking",
  "discovering",
  "downloading",
  "materializing",
  "verifying",
  "ready",
] as const);

export type StandaloneBootstrapProgressStage =
  (typeof STANDALONE_BOOTSTRAP_PROGRESS_STAGES)[number];

export type StandaloneBootstrapProgress = Readonly<{
  initialLoad: boolean;
  progress?: Readonly<{
    completed: number;
    total: number;
    unit: "bytes" | "components";
  }>;
  schemaVersion: typeof STANDALONE_BOOTSTRAP_PROGRESS_SCHEMA_VERSION;
  stage: StandaloneBootstrapProgressStage;
}>;

/** Opaque sidecar-owned handoff-once capability. Product code never decodes it. */
export type StandaloneLifecycleTransitionCredential = Readonly<{
  fence: number;
  id: string;
  token: string;
}>;

export const STANDALONE_BOOTSTRAP_ERROR_CODES = Object.freeze([
  "installer-required",
  "no-standalone",
  "standalone-occupied",
  "standalone-invalid",
] as const);

export type StandaloneBootstrapErrorCode =
  (typeof STANDALONE_BOOTSTRAP_ERROR_CODES)[number];

export type StandaloneBootstrapResult =
  | Readonly<{
      outcome: "resolved";
      resolution: StandaloneBootstrapResolution;
      schemaVersion: typeof STANDALONE_BOOTSTRAP_RESULT_SCHEMA_VERSION;
    }>
  | Readonly<{
      error: Readonly<{
        code: StandaloneBootstrapErrorCode;
        message: string;
      }>;
      outcome: "rejected";
      schemaVersion: typeof STANDALONE_BOOTSTRAP_RESULT_SCHEMA_VERSION;
    }>;

export type StandaloneProtocolJsonValue =
  | boolean
  | null
  | number
  | string
  | StandaloneProtocolJsonValue[]
  | { [key: string]: StandaloneProtocolJsonValue };

export type StandaloneShellCapabilityExchange = Readonly<{
  attachmentId: string;
  handoff: StandaloneHandoffEnvelope;
  requestId: string;
  schemaVersion: typeof STANDALONE_HANDOFF_SCHEMA_VERSION;
}>;

export type StandaloneShellCapabilityRequest = StandaloneShellCapabilityExchange & Readonly<{
  capability: string;
  input: StandaloneProtocolJsonValue;
}>;

export type StandaloneShellCapabilityResult =
  | (StandaloneShellCapabilityExchange & Readonly<{
      outcome: "completed";
      output: StandaloneProtocolJsonValue;
    }>)
  | (StandaloneShellCapabilityExchange & Readonly<{
      outcome: "unsupported";
    }>)
  | (StandaloneShellCapabilityExchange & Readonly<{
      error: Readonly<{ code: string }>;
      outcome: "failed";
    }>);

export interface StandaloneShellCapabilityPort {
  invoke(request: StandaloneShellCapabilityRequest): Promise<StandaloneShellCapabilityResult>;
}

export const STANDALONE_SHELL_CAPABILITIES = Object.freeze({
  EXPORT_ARTIFACT: "open-design.export-artifact.v1",
  EXPORT_PDF: "open-design.export-pdf.v1",
  RENDER_SLIDES: "open-design.render-slides.v1",
} as const);

export type StandaloneShellCapability =
  (typeof STANDALONE_SHELL_CAPABILITIES)[keyof typeof STANDALONE_SHELL_CAPABILITIES];

export function isStandaloneShellCapability(value: unknown): value is StandaloneShellCapability {
  return Object.values(STANDALONE_SHELL_CAPABILITIES).includes(value as StandaloneShellCapability);
}

export type StandaloneExportPdfInput = Readonly<{
  baseHref?: string;
  deck: boolean;
  defaultFilename: string;
  html: string;
  title: string;
}>;

export type StandaloneExportPdfResult = Readonly<{
  canceled?: boolean;
  error?: string;
  ok: boolean;
  path?: string;
}>;

export type StandaloneRenderSlidesInput = Readonly<{
  baseHref?: string;
  deck?: boolean;
  editable?: boolean;
  height?: number;
  html: string;
  index?: number;
  outputDir?: string;
  pageImageFormat?: "jpeg" | "png";
  paginate?: boolean;
  stitch?: boolean;
  width?: number;
}>;

export type StandaloneRenderSlidesErrorCode =
  | "NO_SLIDES"
  | "PAGE_TOO_TALL"
  | "RENDER_FAILED"
  | "SLIDE_INDEX_OUT_OF_RANGE";

export type StandaloneRenderSlidesResult = Readonly<{
  error?: string;
  errorCode?: StandaloneRenderSlidesErrorCode;
  height?: number;
  mode?: "deck" | "page";
  ok: boolean;
  pptxFile?: string;
  slideFiles?: string[];
  slides?: string[];
  width?: number;
}>;

export type StandaloneExportArtifactFormat = "image" | "pdf";
export type StandaloneExportArtifactImageFormat = "jpeg" | "png";

export type StandaloneExportArtifactInput = Readonly<{
  baseHref?: string;
  deck: boolean;
  format: StandaloneExportArtifactFormat;
  height?: number;
  html: string;
  imageFormat?: StandaloneExportArtifactImageFormat;
  title: string;
  width?: number;
}>;

export type StandaloneExportArtifactResult = Readonly<{
  bytes?: number;
  error?: string;
  mime?: string;
  ok: boolean;
  path?: string;
}>;

export type StandaloneShellCapabilityContract = Readonly<{
  [STANDALONE_SHELL_CAPABILITIES.EXPORT_ARTIFACT]: Readonly<{
    input: StandaloneExportArtifactInput;
    output: StandaloneExportArtifactResult;
  }>;
  [STANDALONE_SHELL_CAPABILITIES.EXPORT_PDF]: Readonly<{
    input: StandaloneExportPdfInput;
    output: StandaloneExportPdfResult;
  }>;
  [STANDALONE_SHELL_CAPABILITIES.RENDER_SLIDES]: Readonly<{
    input: StandaloneRenderSlidesInput;
    output: StandaloneRenderSlidesResult;
  }>;
}>;

export type StandaloneShellCapabilityInput<TCapability extends StandaloneShellCapability> =
  StandaloneShellCapabilityContract[TCapability]["input"];

export type StandaloneShellCapabilityOutput<TCapability extends StandaloneShellCapability> =
  StandaloneShellCapabilityContract[TCapability]["output"];

export type StandaloneRuntimeCommandExchange = Readonly<{
  attachmentId: string;
  handoff: StandaloneHandoffEnvelope;
  requestId: string;
  schemaVersion: typeof STANDALONE_HANDOFF_SCHEMA_VERSION;
}>;

export type StandaloneRuntimeCommandRequest = StandaloneRuntimeCommandExchange & Readonly<{
  command: string;
  input: StandaloneProtocolJsonValue;
}>;

export type StandaloneRuntimeCommandResult =
  | (StandaloneRuntimeCommandExchange & Readonly<{
      outcome: "completed";
      output: StandaloneProtocolJsonValue;
    }>)
  | (StandaloneRuntimeCommandExchange & Readonly<{
      outcome: "unsupported";
    }>)
  | (StandaloneRuntimeCommandExchange & Readonly<{
      error: Readonly<{ code: string }>;
      outcome: "failed";
    }>);

export type StandaloneHandoffDescriptor = Readonly<{
  attachment: StandaloneAttachmentDescriptor;
  handoff: StandaloneHandoffEnvelope;
  paths: StandalonePaths;
  transition?: StandaloneLifecycleTransitionCredential | null;
}>;

export type StandaloneHandoffRequest = StandaloneHandoffDescriptor & Readonly<{
  capabilities: StandaloneShellCapabilityPort;
}>;

type StandaloneRuntimeStatusBase = Readonly<{
  handoff: StandaloneHandoffEnvelope;
  pid: number;
  schemaVersion: typeof STANDALONE_HANDOFF_SCHEMA_VERSION;
}>;

export type StandaloneRuntimeRunningStatus = StandaloneRuntimeStatusBase & Readonly<{
  daemonUrl: string;
  state: "running";
  webUrl: string;
}>;

export type StandaloneRuntimeStoppedStatus = StandaloneRuntimeStatusBase & Readonly<{
  state: "stopped";
}>;

export type StandaloneRuntimeFailedStatus = StandaloneRuntimeStatusBase & Readonly<{
  error: Readonly<{ code: string }>;
  state: "failed";
}>;

export type StandaloneRuntimeTerminalStatus =
  | StandaloneRuntimeStoppedStatus
  | StandaloneRuntimeFailedStatus;

export type StandaloneRuntimeStatus =
  | StandaloneRuntimeRunningStatus
  | StandaloneRuntimeTerminalStatus;

type StandaloneUpdaterProviderBase = Readonly<{
  handoff: StandaloneHandoffEnvelope;
  incarnation: string;
  providerId: string;
  schemaVersion: typeof STANDALONE_UPDATER_SCHEMA_VERSION;
}>;

export type StandaloneUpdaterProviderDescriptor =
  | (StandaloneUpdaterProviderBase & Readonly<{
      owner: "standalone";
    }>)
  | (StandaloneUpdaterProviderBase & Readonly<{
      attachmentId: string;
      hostScope: string;
      owner: "shell";
    }>);

export type StandaloneUpdaterActionPresentation = Readonly<{
  detail?: string;
  emphasis: "danger" | "primary" | "secondary";
  id: string;
  label: string;
}>;

export type StandaloneUpdaterState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "applying"
  | "handed-off"
  | "failed";

export type StandaloneUpdaterSnapshot = Readonly<{
  actions: readonly StandaloneUpdaterActionPresentation[];
  presentation: Readonly<{
    detail?: string;
    title: string;
  }>;
  progress?: Readonly<{
    completed: number;
    total: number;
  }>;
  provider: StandaloneUpdaterProviderDescriptor;
  revision: number;
  schemaVersion: typeof STANDALONE_UPDATER_SCHEMA_VERSION;
  state: StandaloneUpdaterState;
}>;

export type StandaloneUpdaterWaitRequest = Readonly<{
  afterRevision: number;
  provider: StandaloneUpdaterProviderDescriptor;
  schemaVersion: typeof STANDALONE_UPDATER_SCHEMA_VERSION;
  timeoutMs: number;
}>;

export type StandaloneUpdaterActionRequest = Readonly<{
  actionId: string;
  provider: StandaloneUpdaterProviderDescriptor;
  requestId: string;
  schemaVersion: typeof STANDALONE_UPDATER_SCHEMA_VERSION;
}>;

type StandaloneUpdaterActionExchange = Readonly<{
  actionId: string;
  provider: StandaloneUpdaterProviderDescriptor;
  requestId: string;
  schemaVersion: typeof STANDALONE_UPDATER_SCHEMA_VERSION;
}>;

export type StandaloneUpdaterActionResult =
  | (StandaloneUpdaterActionExchange & Readonly<{
      operationId: string;
      outcome: "accepted";
    }>)
  | (StandaloneUpdaterActionExchange & Readonly<{
      outcome: "unsupported";
    }>)
  | (StandaloneUpdaterActionExchange & Readonly<{
      error: Readonly<{ code: string }>;
      outcome: "failed";
    }>);

export interface StandaloneUpdaterProviderPort {
  invoke(request: StandaloneUpdaterActionRequest): Promise<StandaloneUpdaterActionResult>;
  readSnapshot(): Promise<StandaloneUpdaterSnapshot>;
  waitForChange(request: StandaloneUpdaterWaitRequest): Promise<StandaloneUpdaterSnapshot>;
}

export interface StandaloneHandle {
  close(): Promise<StandaloneRuntimeTerminalStatus>;
  invoke(request: StandaloneRuntimeCommandRequest): Promise<StandaloneRuntimeCommandResult>;
  readStatus(): Promise<StandaloneRuntimeStatus>;
  waitForTerminal(): Promise<StandaloneRuntimeTerminalStatus>;
}

export type StandaloneLifecycleOccupant = Readonly<{
  generation: number;
  incarnation: string;
  key: string;
  projection?: StandaloneProtocolJsonValue;
}>;

export interface StandaloneLifecycleTransition {
  release(): Promise<void>;
}

export type StandaloneLifecycleTransitionResult =
  | Readonly<{
      state: "acquired";
      transition: StandaloneLifecycleTransition;
    }>
  | Readonly<{
      occupants: readonly StandaloneLifecycleOccupant[];
      reason: "occupied" | "transition-active" | "unavailable";
      state: "blocked";
    }>;

/**
 * Shell-local semantic lifecycle port. Implementations keep sidecar paths,
 * credentials and transport private; callers only select an opaque transition
 * kind and receive non-secret occupant projections on a quick failure.
 */
export interface StandaloneLifecyclePort {
  beginTransition(kind: string): Promise<StandaloneLifecycleTransitionResult>;
}

/** The validated outer Shell adapter; raw Standalone body handles stay smaller. */
export interface StandaloneShellHandle extends StandaloneHandle {
  lifecycle: StandaloneLifecyclePort;
}

export type StandaloneHandoff = (
  request: StandaloneHandoffRequest,
) => Promise<StandaloneHandle>;

export class StandaloneProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StandaloneProtocolError";
  }
}


export * from "./core-validation.js";
export * from "./operations.js";
