import { createHash } from "node:crypto";
import { isAbsolute, posix, win32 } from "node:path";

import { isReleaseChannel, type ReleaseChannel } from "@open-design/release";

export const STANDALONE_PROTOCOL_VERSION = 1 as const;
export const STANDALONE_BOOTSTRAP_SCHEMA_VERSION = 1 as const;
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

export const STANDALONE_BOOTSTRAP_ERROR_CODES = Object.freeze([
  "installer-required",
  "no-standalone",
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

type StandaloneShellCapabilityExchange = Readonly<{
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

type StandaloneRuntimeCommandExchange = Readonly<{
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

export type StandaloneHandoff = (
  request: StandaloneHandoffRequest,
) => Promise<StandaloneHandle>;

export class StandaloneProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StandaloneProtocolError";
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new StandaloneProtocolError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function normalizeToken(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u.test(value)
  ) {
    throw new StandaloneProtocolError(`${label} must be a lowercase protocol token`);
  }
  return value;
}

function normalizeNamespace(value: unknown): string {
  if (
    typeof value !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)
  ) {
    throw new StandaloneProtocolError("standalone namespace must be a safe local token");
  }
  return value;
}

function normalizeVersion(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || !/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(value)
  ) {
    throw new StandaloneProtocolError(`${label} must be a comparable semantic version`);
  }
  return value;
}

function normalizeDigest(value: unknown): StandaloneDigest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new StandaloneProtocolError("standalone digest must be a lowercase sha256 digest");
  }
  return value as StandaloneDigest;
}

function normalizePath(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || value.includes("\0")
    || (!isAbsolute(value) && !posix.isAbsolute(value) && !win32.isAbsolute(value))
  ) {
    throw new StandaloneProtocolError(`${label} must be an absolute path`);
  }
  return value;
}

function normalizeNullableHttpUrl(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new StandaloneProtocolError(`${label} must be null or an absolute http(s) URL`);
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported protocol");
    return parsed.toString();
  } catch {
    throw new StandaloneProtocolError(`${label} must be null or an absolute http(s) URL`);
  }
}

function normalizeJsonValue(
  value: unknown,
  label: string,
  seen: Set<object> = new Set(),
): StandaloneProtocolJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new StandaloneProtocolError(`${label} numbers must be finite`);
    return value;
  }
  if (typeof value !== "object") {
    throw new StandaloneProtocolError(`${label} must contain only JSON values`);
  }
  if (seen.has(value)) throw new StandaloneProtocolError(`${label} must not contain cycles`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) => normalizeJsonValue(entry, `${label}[${index}]`, seen));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new StandaloneProtocolError(`${label} objects must be plain JSON records`);
    }
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      normalizeJsonValue(entry, `${label}.${key}`, seen),
    ]));
  } finally {
    seen.delete(value);
  }
}

function requireKnownKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const allowed = new Set(keys);
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length > 0) {
    throw new StandaloneProtocolError(`${label} contains unsupported fields: ${extras.join(", ")}`);
  }
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new StandaloneProtocolError(`${label} must be a boolean`);
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") throw new StandaloneProtocolError(`${label} must be a string`);
  return value;
}

function requiredString(value: unknown, label: string): string {
  const normalized = optionalString(value, label);
  if (normalized == null || normalized.length === 0) {
    throw new StandaloneProtocolError(`${label} must be a non-empty string`);
  }
  return normalized;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value == null) return undefined;
  return requireBoolean(value, label);
}

function optionalPositiveNumber(value: unknown, label: string): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new StandaloneProtocolError(`${label} must be a positive number`);
  }
  return value;
}

function optionalNonNegativeInteger(value: unknown, label: string): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new StandaloneProtocolError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function optionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new StandaloneProtocolError(`${label} must be an array of strings`);
  }
  return [...value] as string[];
}

function validateExportPdfInput(value: unknown): StandaloneExportPdfInput {
  const input = requireRecord(value, "standalone PDF export input");
  requireKnownKeys(input, ["baseHref", "deck", "defaultFilename", "html", "title"], "standalone PDF export input");
  return {
    ...(input.baseHref == null ? {} : { baseHref: requiredString(input.baseHref, "standalone PDF export baseHref") }),
    deck: requireBoolean(input.deck, "standalone PDF export deck"),
    defaultFilename: requiredString(input.defaultFilename, "standalone PDF export defaultFilename"),
    html: requiredString(input.html, "standalone PDF export html"),
    title: requiredString(input.title, "standalone PDF export title"),
  };
}

function validateExportPdfResult(value: unknown): StandaloneExportPdfResult {
  const result = requireRecord(value, "standalone PDF export result");
  requireKnownKeys(result, ["canceled", "error", "ok", "path"], "standalone PDF export result");
  return {
    ...(result.canceled == null ? {} : { canceled: requireBoolean(result.canceled, "standalone PDF export canceled") }),
    ...(result.error == null ? {} : { error: optionalString(result.error, "standalone PDF export error")! }),
    ok: requireBoolean(result.ok, "standalone PDF export ok"),
    ...(result.path == null ? {} : { path: optionalString(result.path, "standalone PDF export path")! }),
  };
}

function validateRenderSlidesInput(value: unknown): StandaloneRenderSlidesInput {
  const input = requireRecord(value, "standalone slide render input");
  requireKnownKeys(input, [
    "baseHref", "deck", "editable", "height", "html", "index", "outputDir",
    "pageImageFormat", "paginate", "stitch", "width",
  ], "standalone slide render input");
  const outputDir = input.outputDir == null
    ? undefined
    : requiredString(input.outputDir, "standalone slide render outputDir");
  if (outputDir != null && !isAbsolute(outputDir) && !posix.isAbsolute(outputDir) && !win32.isAbsolute(outputDir)) {
    throw new StandaloneProtocolError("standalone slide render outputDir must be an absolute path");
  }
  if (input.pageImageFormat != null && input.pageImageFormat !== "jpeg" && input.pageImageFormat !== "png") {
    throw new StandaloneProtocolError("standalone slide render pageImageFormat must be jpeg or png");
  }
  return {
    ...(input.baseHref == null ? {} : { baseHref: requiredString(input.baseHref, "standalone slide render baseHref") }),
    ...(input.deck == null ? {} : { deck: optionalBoolean(input.deck, "standalone slide render deck")! }),
    ...(input.editable == null ? {} : { editable: optionalBoolean(input.editable, "standalone slide render editable")! }),
    ...(input.height == null ? {} : { height: optionalPositiveNumber(input.height, "standalone slide render height")! }),
    html: requiredString(input.html, "standalone slide render html"),
    ...(input.index == null ? {} : { index: optionalNonNegativeInteger(input.index, "standalone slide render index")! }),
    ...(outputDir == null ? {} : { outputDir }),
    ...(input.pageImageFormat == null ? {} : { pageImageFormat: input.pageImageFormat }),
    ...(input.paginate == null ? {} : { paginate: optionalBoolean(input.paginate, "standalone slide render paginate")! }),
    ...(input.stitch == null ? {} : { stitch: optionalBoolean(input.stitch, "standalone slide render stitch")! }),
    ...(input.width == null ? {} : { width: optionalPositiveNumber(input.width, "standalone slide render width")! }),
  };
}

function validateRenderSlidesResult(value: unknown): StandaloneRenderSlidesResult {
  const result = requireRecord(value, "standalone slide render result");
  requireKnownKeys(result, [
    "error", "errorCode", "height", "mode", "ok", "pptxFile", "slideFiles", "slides", "width",
  ], "standalone slide render result");
  const errorCodes: readonly StandaloneRenderSlidesErrorCode[] = [
    "NO_SLIDES", "PAGE_TOO_TALL", "RENDER_FAILED", "SLIDE_INDEX_OUT_OF_RANGE",
  ];
  if (result.errorCode != null && !errorCodes.includes(result.errorCode as StandaloneRenderSlidesErrorCode)) {
    throw new StandaloneProtocolError("standalone slide render errorCode is unsupported");
  }
  if (result.mode != null && result.mode !== "deck" && result.mode !== "page") {
    throw new StandaloneProtocolError("standalone slide render mode must be deck or page");
  }
  return {
    ...(result.error == null ? {} : { error: optionalString(result.error, "standalone slide render error")! }),
    ...(result.errorCode == null ? {} : { errorCode: result.errorCode as StandaloneRenderSlidesErrorCode }),
    ...(result.height == null ? {} : { height: optionalPositiveNumber(result.height, "standalone slide render height")! }),
    ...(result.mode == null ? {} : { mode: result.mode }),
    ok: requireBoolean(result.ok, "standalone slide render ok"),
    ...(result.pptxFile == null ? {} : { pptxFile: optionalString(result.pptxFile, "standalone slide render pptxFile")! }),
    ...(result.slideFiles == null ? {} : { slideFiles: optionalStringArray(result.slideFiles, "standalone slide render slideFiles")! }),
    ...(result.slides == null ? {} : { slides: optionalStringArray(result.slides, "standalone slide render slides")! }),
    ...(result.width == null ? {} : { width: optionalPositiveNumber(result.width, "standalone slide render width")! }),
  };
}

function validateExportArtifactInput(value: unknown): StandaloneExportArtifactInput {
  const input = requireRecord(value, "standalone artifact export input");
  requireKnownKeys(input, ["baseHref", "deck", "format", "height", "html", "imageFormat", "title", "width"], "standalone artifact export input");
  if (input.format !== "image" && input.format !== "pdf") {
    throw new StandaloneProtocolError("standalone artifact export format must be image or pdf");
  }
  if (input.imageFormat != null && input.imageFormat !== "jpeg" && input.imageFormat !== "png") {
    throw new StandaloneProtocolError("standalone artifact export imageFormat must be jpeg or png");
  }
  return {
    ...(input.baseHref == null ? {} : { baseHref: requiredString(input.baseHref, "standalone artifact export baseHref") }),
    deck: requireBoolean(input.deck, "standalone artifact export deck"),
    format: input.format,
    ...(input.height == null ? {} : { height: optionalPositiveNumber(input.height, "standalone artifact export height")! }),
    html: requiredString(input.html, "standalone artifact export html"),
    ...(input.imageFormat == null ? {} : { imageFormat: input.imageFormat }),
    title: requiredString(input.title, "standalone artifact export title"),
    ...(input.width == null ? {} : { width: optionalPositiveNumber(input.width, "standalone artifact export width")! }),
  };
}

function validateExportArtifactResult(value: unknown): StandaloneExportArtifactResult {
  const result = requireRecord(value, "standalone artifact export result");
  requireKnownKeys(result, ["bytes", "error", "mime", "ok", "path"], "standalone artifact export result");
  return {
    ...(result.bytes == null ? {} : { bytes: optionalNonNegativeInteger(result.bytes, "standalone artifact export bytes")! }),
    ...(result.error == null ? {} : { error: optionalString(result.error, "standalone artifact export error")! }),
    ...(result.mime == null ? {} : { mime: optionalString(result.mime, "standalone artifact export mime")! }),
    ok: requireBoolean(result.ok, "standalone artifact export ok"),
    ...(result.path == null ? {} : { path: optionalString(result.path, "standalone artifact export path")! }),
  };
}

export function validateStandaloneShellCapabilityInput<
  TCapability extends StandaloneShellCapability,
>(
  capability: TCapability,
  value: unknown,
): StandaloneShellCapabilityInput<TCapability> {
  switch (capability) {
    case STANDALONE_SHELL_CAPABILITIES.EXPORT_ARTIFACT:
      return validateExportArtifactInput(value) as StandaloneShellCapabilityInput<TCapability>;
    case STANDALONE_SHELL_CAPABILITIES.EXPORT_PDF:
      return validateExportPdfInput(value) as StandaloneShellCapabilityInput<TCapability>;
    case STANDALONE_SHELL_CAPABILITIES.RENDER_SLIDES:
      return validateRenderSlidesInput(value) as StandaloneShellCapabilityInput<TCapability>;
  }
}

export function validateStandaloneShellCapabilityOutput<
  TCapability extends StandaloneShellCapability,
>(
  capability: TCapability,
  value: unknown,
): StandaloneShellCapabilityOutput<TCapability> {
  switch (capability) {
    case STANDALONE_SHELL_CAPABILITIES.EXPORT_ARTIFACT:
      return validateExportArtifactResult(value) as StandaloneShellCapabilityOutput<TCapability>;
    case STANDALONE_SHELL_CAPABILITIES.EXPORT_PDF:
      return validateExportPdfResult(value) as StandaloneShellCapabilityOutput<TCapability>;
    case STANDALONE_SHELL_CAPABILITIES.RENDER_SLIDES:
      return validateRenderSlidesResult(value) as StandaloneShellCapabilityOutput<TCapability>;
  }
}

export function validateStandaloneHandoffScope(value: unknown): StandaloneHandoffScope {
  const scope = requireRecord(value, "standalone handoff scope");
  if (!isReleaseChannel(scope.channel)) {
    throw new StandaloneProtocolError(`unsupported standalone channel: ${String(scope.channel)}`);
  }
  if (
    typeof scope.generation !== "number"
    || !Number.isSafeInteger(scope.generation)
    || scope.generation < 0
  ) {
    throw new StandaloneProtocolError("standalone generation must be a non-negative safe integer");
  }
  return {
    channel: scope.channel,
    generation: scope.generation,
    namespace: normalizeNamespace(scope.namespace),
  };
}

export function validateStandaloneRuntimeDescriptor(value: unknown): StandaloneRuntimeDescriptor {
  const descriptor = requireRecord(value, "standalone runtime descriptor");
  const release = requireRecord(descriptor.release, "standalone release descriptor");
  const standalone = requireRecord(descriptor.standalone, "standalone body descriptor");
  if (standalone.protocolVersion !== STANDALONE_PROTOCOL_VERSION) {
    throw new StandaloneProtocolError(
      `unsupported standalone protocol version: ${String(standalone.protocolVersion)}`,
    );
  }
  return {
    release: {
      version: normalizeVersion(release.version, "standalone release version"),
    },
    standalone: {
      digest: normalizeDigest(standalone.digest),
      protocolVersion: STANDALONE_PROTOCOL_VERSION,
      version: normalizeVersion(standalone.version, "standalone body version"),
    },
  };
}

function descriptorJson(descriptor: StandaloneRuntimeDescriptor): string {
  return JSON.stringify({
    release: { version: descriptor.release.version },
    standalone: {
      digest: descriptor.standalone.digest,
      protocolVersion: descriptor.standalone.protocolVersion,
      version: descriptor.standalone.version,
    },
  });
}

export function validateStandaloneAttachmentDescriptor(
  value: unknown,
): StandaloneAttachmentDescriptor {
  const attachment = requireRecord(value, "standalone attachment descriptor");
  const shell = requireRecord(attachment.shell, "standalone attachment shell descriptor");
  return {
    id: normalizeToken(attachment.id, "standalone attachment id"),
    shell: {
      digest: normalizeDigest(shell.digest),
      type: normalizeToken(shell.type, "standalone shell type"),
      version: normalizeVersion(shell.version, "standalone shell version"),
    },
  };
}

export function validateStandaloneBootstrapScope(value: unknown): StandaloneBootstrapScope {
  const scope = requireRecord(value, "standalone bootstrap scope");
  requireKnownKeys(scope, ["channel", "namespace"], "standalone bootstrap scope");
  if (!isReleaseChannel(scope.channel)) {
    throw new StandaloneProtocolError(`unsupported standalone channel: ${String(scope.channel)}`);
  }
  return Object.freeze({
    channel: scope.channel,
    namespace: normalizeNamespace(scope.namespace),
  });
}

export function validateStandaloneBootstrapDescriptor(
  value: unknown,
): StandaloneBootstrapDescriptor {
  const descriptor = requireRecord(value, "standalone bootstrap descriptor");
  requireKnownKeys(
    descriptor,
    ["attachment", "discovery", "paths", "repositoryConfigPath", "schemaVersion", "scope"],
    "standalone bootstrap descriptor",
  );
  if (descriptor.schemaVersion !== STANDALONE_BOOTSTRAP_SCHEMA_VERSION) {
    throw new StandaloneProtocolError("standalone bootstrap schemaVersion is unsupported");
  }
  const discovery = requireRecord(descriptor.discovery, "standalone bootstrap discovery");
  requireKnownKeys(discovery, ["metadataUrl", "target"], "standalone bootstrap discovery");
  return Object.freeze({
    attachment: validateStandaloneAttachmentDescriptor(descriptor.attachment),
    discovery: Object.freeze({
      metadataUrl: normalizeNullableHttpUrl(discovery.metadataUrl, "standalone bootstrap metadataUrl"),
      target: normalizeToken(discovery.target, "standalone bootstrap target"),
    }),
    paths: validateStandalonePaths(descriptor.paths),
    repositoryConfigPath: normalizePath(
      descriptor.repositoryConfigPath,
      "standalone bootstrap repositoryConfigPath",
    ),
    schemaVersion: STANDALONE_BOOTSTRAP_SCHEMA_VERSION,
    scope: validateStandaloneBootstrapScope(descriptor.scope),
  });
}

export function validateStandaloneBootstrapRequest(value: unknown): StandaloneBootstrapRequest {
  const request = requireRecord(value, "standalone bootstrap request");
  requireKnownKeys(
    request,
    ["attachment", "capabilities", "discovery", "paths", "repositoryConfigPath", "schemaVersion", "scope"],
    "standalone bootstrap request",
  );
  const descriptor = validateStandaloneBootstrapDescriptor({
    attachment: request.attachment,
    discovery: request.discovery,
    paths: request.paths,
    repositoryConfigPath: request.repositoryConfigPath,
    schemaVersion: request.schemaVersion,
    scope: request.scope,
  });
  const capabilities = requireRecord(request.capabilities, "standalone bootstrap capabilities");
  if (typeof capabilities.invoke !== "function") {
    throw new StandaloneProtocolError("standalone bootstrap capabilities must provide invoke()");
  }
  return Object.freeze({ ...descriptor, capabilities: request.capabilities as StandaloneShellCapabilityPort });
}

export function validateStandaloneBootstrapResolution(
  value: unknown,
): StandaloneBootstrapResolution {
  const resolution = requireRecord(value, "standalone bootstrap resolution");
  requireKnownKeys(resolution, ["bootloaderPath", "handoff"], "standalone bootstrap resolution");
  const bootloaderPath = normalizePath(resolution.bootloaderPath, "standalone bootstrap bootloaderPath");
  if (!bootloaderPath.endsWith(`/${STANDALONE_BOOTLOADER_ENTRY_PATH}`)
    && !bootloaderPath.endsWith(`\\${STANDALONE_BOOTLOADER_ENTRY_PATH}`)) {
    throw new StandaloneProtocolError(
      `standalone bootstrap bootloaderPath must end with ${STANDALONE_BOOTLOADER_ENTRY_PATH}`,
    );
  }
  return Object.freeze({
    bootloaderPath,
    handoff: validateStandaloneHandoffDescriptor(resolution.handoff),
  });
}

export function validateStandaloneBootstrapResult(
  value: unknown,
): StandaloneBootstrapResult {
  const result = requireRecord(value, "standalone bootstrap result");
  if (result.schemaVersion !== STANDALONE_BOOTSTRAP_RESULT_SCHEMA_VERSION) {
    throw new StandaloneProtocolError("standalone bootstrap result schemaVersion is unsupported");
  }
  if (result.outcome === "resolved") {
    requireKnownKeys(
      result,
      ["outcome", "resolution", "schemaVersion"],
      "standalone bootstrap result",
    );
    return Object.freeze({
      outcome: "resolved",
      resolution: validateStandaloneBootstrapResolution(result.resolution),
      schemaVersion: STANDALONE_BOOTSTRAP_RESULT_SCHEMA_VERSION,
    });
  }
  if (result.outcome !== "rejected") {
    throw new StandaloneProtocolError("standalone bootstrap result outcome is unsupported");
  }
  requireKnownKeys(
    result,
    ["error", "outcome", "schemaVersion"],
    "standalone bootstrap result",
  );
  const error = requireRecord(result.error, "standalone bootstrap error");
  requireKnownKeys(error, ["code", "message"], "standalone bootstrap error");
  if (!STANDALONE_BOOTSTRAP_ERROR_CODES.includes(error.code as StandaloneBootstrapErrorCode)) {
    throw new StandaloneProtocolError("standalone bootstrap error code is unsupported");
  }
  return Object.freeze({
    error: Object.freeze({
      code: error.code as StandaloneBootstrapErrorCode,
      message: requiredString(error.message, "standalone bootstrap error message"),
    }),
    outcome: "rejected",
    schemaVersion: STANDALONE_BOOTSTRAP_RESULT_SCHEMA_VERSION,
  });
}

export function digestStandaloneRuntimeDescriptor(value: unknown): StandaloneDigest {
  const descriptor = validateStandaloneRuntimeDescriptor(value);
  return `sha256:${createHash("sha256").update(descriptorJson(descriptor)).digest("hex")}`;
}

export function sameStandaloneHandoffScope(
  left: StandaloneHandoffScope,
  right: StandaloneHandoffScope,
): boolean {
  return (
    left.channel === right.channel
    && left.generation === right.generation
    && left.namespace === right.namespace
  );
}

export function sameStandaloneHandoffEnvelope(
  left: StandaloneHandoffEnvelope,
  right: StandaloneHandoffEnvelope,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion
    && left.descriptorDigest === right.descriptorDigest
    && sameStandaloneHandoffScope(left.scope, right.scope)
  );
}

export function createStandaloneHandoffEnvelope(
  input: Readonly<{
    descriptor: StandaloneRuntimeDescriptor;
    scope: StandaloneHandoffScope;
  }>,
): StandaloneHandoffEnvelope {
  const descriptor = validateStandaloneRuntimeDescriptor(input.descriptor);
  return validateStandaloneHandoffEnvelope({
    descriptor,
    descriptorDigest: digestStandaloneRuntimeDescriptor(descriptor),
    schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    scope: input.scope,
  });
}

export function validateStandaloneHandoffEnvelope(
  value: unknown,
  expected?: StandaloneHandoffEnvelope,
): StandaloneHandoffEnvelope {
  const envelope = requireRecord(value, "standalone handoff");
  if (envelope.schemaVersion !== STANDALONE_HANDOFF_SCHEMA_VERSION) {
    throw new StandaloneProtocolError(
      `unsupported standalone handoff schema version: ${String(envelope.schemaVersion)}`,
    );
  }
  const descriptor = validateStandaloneRuntimeDescriptor(envelope.descriptor);
  const descriptorDigest = normalizeDigest(envelope.descriptorDigest);
  if (descriptorDigest !== digestStandaloneRuntimeDescriptor(descriptor)) {
    throw new StandaloneProtocolError(
      "standalone descriptorDigest does not match the runtime descriptor",
    );
  }
  const normalized = {
    descriptor,
    descriptorDigest,
    schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    scope: validateStandaloneHandoffScope(envelope.scope),
  } as const;
  if (
    expected != null
    && (
      !sameStandaloneHandoffEnvelope(normalized, expected)
    )
  ) {
    throw new StandaloneProtocolError(
      "standalone handoff does not match the committed generation and descriptor",
    );
  }
  return normalized;
}

export function validateStandalonePaths(value: unknown): StandalonePaths {
  const paths = requireRecord(value, "standalone paths");
  return {
    cacheRoot: normalizePath(paths.cacheRoot, "standalone cacheRoot"),
    dataRoot: normalizePath(paths.dataRoot, "standalone dataRoot"),
    installationRoot: normalizePath(paths.installationRoot, "standalone installationRoot"),
    logsRoot: normalizePath(paths.logsRoot, "standalone logsRoot"),
    resourceRoot: normalizePath(paths.resourceRoot, "standalone resourceRoot"),
    runtimeRoot: normalizePath(paths.runtimeRoot, "standalone runtimeRoot"),
  };
}

export function validateStandaloneHandoffDescriptor(value: unknown): StandaloneHandoffDescriptor {
  const request = requireRecord(value, "standalone handoff descriptor");
  requireKnownKeys(
    request,
    ["attachment", "handoff", "paths"],
    "standalone handoff descriptor",
  );
  return {
    attachment: validateStandaloneAttachmentDescriptor(request.attachment),
    handoff: validateStandaloneHandoffEnvelope(request.handoff),
    paths: validateStandalonePaths(request.paths),
  };
}

export function validateStandaloneHandoffRequest(value: unknown): StandaloneHandoffRequest {
  const request = requireRecord(value, "standalone handoff request");
  requireKnownKeys(
    request,
    ["attachment", "capabilities", "handoff", "paths"],
    "standalone handoff request",
  );
  const descriptor = validateStandaloneHandoffDescriptor({
    attachment: request.attachment,
    handoff: request.handoff,
    paths: request.paths,
  });
  const capabilities = requireRecord(request.capabilities, "standalone shell capability port");
  if (typeof capabilities.invoke !== "function") {
    throw new StandaloneProtocolError("standalone shell capability port must expose invoke()");
  }
  return {
    ...descriptor,
    capabilities: request.capabilities as StandaloneShellCapabilityPort,
  };
}

function validateCapabilityExchange(
  value: Record<string, unknown>,
  expected?: { attachmentId?: string; handoff?: StandaloneHandoffEnvelope; requestId?: string },
): StandaloneShellCapabilityExchange {
  if (value.schemaVersion !== STANDALONE_HANDOFF_SCHEMA_VERSION) {
    throw new StandaloneProtocolError("unsupported standalone capability schema version");
  }
  const handoff = validateStandaloneHandoffEnvelope(value.handoff, expected?.handoff);
  const attachmentId = normalizeToken(value.attachmentId, "standalone capability attachmentId");
  if (expected?.attachmentId != null && attachmentId !== expected.attachmentId) {
    throw new StandaloneProtocolError("standalone capability attachmentId does not match");
  }
  const requestId = normalizeToken(value.requestId, "standalone capability requestId");
  if (expected?.requestId != null && requestId !== expected.requestId) {
    throw new StandaloneProtocolError("standalone capability requestId does not match");
  }
  return { attachmentId, handoff, requestId, schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION };
}

function validateRuntimeCommandExchange(
  value: Record<string, unknown>,
  expected?: { attachmentId?: string; handoff?: StandaloneHandoffEnvelope; requestId?: string },
): StandaloneRuntimeCommandExchange {
  if (value.schemaVersion !== STANDALONE_HANDOFF_SCHEMA_VERSION) {
    throw new StandaloneProtocolError("unsupported standalone runtime command schema version");
  }
  const handoff = validateStandaloneHandoffEnvelope(value.handoff, expected?.handoff);
  const attachmentId = normalizeToken(value.attachmentId, "standalone runtime command attachmentId");
  if (expected?.attachmentId != null && attachmentId !== expected.attachmentId) {
    throw new StandaloneProtocolError("standalone runtime command attachmentId does not match");
  }
  const requestId = normalizeToken(value.requestId, "standalone runtime command requestId");
  if (expected?.requestId != null && requestId !== expected.requestId) {
    throw new StandaloneProtocolError("standalone runtime command requestId does not match");
  }
  return { attachmentId, handoff, requestId, schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION };
}

export function validateStandaloneShellCapabilityRequest(
  value: unknown,
  expected?: { attachmentId?: string; handoff?: StandaloneHandoffEnvelope },
): StandaloneShellCapabilityRequest {
  const request = requireRecord(value, "standalone shell capability request");
  const capability = normalizeToken(request.capability, "standalone shell capability");
  return {
    ...validateCapabilityExchange(request, expected),
    capability,
    input: isStandaloneShellCapability(capability)
      ? validateStandaloneShellCapabilityInput(capability, request.input) as StandaloneProtocolJsonValue
      : normalizeJsonValue(request.input, "standalone shell capability input"),
  };
}

export function validateStandaloneShellCapabilityResult(
  value: unknown,
  expected?: {
    capability?: string;
    attachmentId?: string;
    handoff?: StandaloneHandoffEnvelope;
    requestId?: string;
  },
): StandaloneShellCapabilityResult {
  const result = requireRecord(value, "standalone shell capability result");
  const exchange = validateCapabilityExchange(result, expected);
  if (result.outcome === "completed") {
    return {
      ...exchange,
      outcome: "completed",
      output: expected?.capability != null && isStandaloneShellCapability(expected.capability)
        ? validateStandaloneShellCapabilityOutput(expected.capability, result.output) as StandaloneProtocolJsonValue
        : normalizeJsonValue(result.output, "standalone shell capability output"),
    };
  }
  if (result.outcome === "unsupported") return { ...exchange, outcome: "unsupported" };
  if (result.outcome === "failed") {
    const error = requireRecord(result.error, "standalone shell capability error");
    return {
      ...exchange,
      error: { code: normalizeToken(error.code, "standalone shell capability error code") },
      outcome: "failed",
    };
  }
  throw new StandaloneProtocolError(
    `unsupported standalone shell capability outcome: ${String(result.outcome)}`,
  );
}

export function validateStandaloneRuntimeCommandRequest(
  value: unknown,
  expected?: { attachmentId?: string; handoff?: StandaloneHandoffEnvelope },
): StandaloneRuntimeCommandRequest {
  const request = requireRecord(value, "standalone runtime command request");
  return {
    ...validateRuntimeCommandExchange(request, expected),
    command: normalizeToken(request.command, "standalone runtime command"),
    input: normalizeJsonValue(request.input, "standalone runtime command input"),
  };
}

export function validateStandaloneRuntimeCommandResult(
  value: unknown,
  expected?: { attachmentId?: string; handoff?: StandaloneHandoffEnvelope; requestId?: string },
): StandaloneRuntimeCommandResult {
  const result = requireRecord(value, "standalone runtime command result");
  const exchange = validateRuntimeCommandExchange(result, expected);
  if (result.outcome === "completed") {
    return {
      ...exchange,
      outcome: "completed",
      output: normalizeJsonValue(result.output, "standalone runtime command output"),
    };
  }
  if (result.outcome === "unsupported") return { ...exchange, outcome: "unsupported" };
  if (result.outcome === "failed") {
    const error = requireRecord(result.error, "standalone runtime command error");
    return {
      ...exchange,
      error: { code: normalizeToken(error.code, "standalone runtime command error code") },
      outcome: "failed",
    };
  }
  throw new StandaloneProtocolError(
    `unsupported standalone runtime command outcome: ${String(result.outcome)}`,
  );
}

export function validateStandaloneRuntimeStatus(
  value: unknown,
  expected?: { handoff?: StandaloneHandoffEnvelope; state?: StandaloneRuntimeStatus["state"] },
): StandaloneRuntimeStatus {
  const status = requireRecord(value, "standalone runtime status");
  if (status.schemaVersion !== STANDALONE_HANDOFF_SCHEMA_VERSION) {
    throw new StandaloneProtocolError("unsupported standalone runtime status schema version");
  }
  const handoff = validateStandaloneHandoffEnvelope(status.handoff, expected?.handoff);
  if (
    typeof status.pid !== "number"
    || !Number.isSafeInteger(status.pid)
    || status.pid <= 0
  ) {
    throw new StandaloneProtocolError("standalone runtime pid must be a positive safe integer");
  }
  if (expected?.state != null && status.state !== expected.state) {
    throw new StandaloneProtocolError(
      `standalone runtime state ${String(status.state)} does not match ${expected.state}`,
    );
  }
  const base = {
    handoff,
    pid: status.pid,
    schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
  } as const;
  if (status.state === "running") {
    if (typeof status.daemonUrl !== "string" || !/^https?:\/\//u.test(status.daemonUrl)) {
      throw new StandaloneProtocolError("running standalone status must contain an http(s) daemonUrl");
    }
    if (typeof status.webUrl !== "string" || !/^https?:\/\//u.test(status.webUrl)) {
      throw new StandaloneProtocolError("running standalone status must contain an http(s) webUrl");
    }
    return { ...base, daemonUrl: status.daemonUrl, state: "running", webUrl: status.webUrl };
  }
  if (status.state === "stopped") return { ...base, state: "stopped" };
  if (status.state === "failed") {
    const error = requireRecord(status.error, "standalone runtime error");
    return {
      ...base,
      error: { code: normalizeToken(error.code, "standalone runtime error code") },
      state: "failed",
    };
  }
  throw new StandaloneProtocolError(`unsupported standalone runtime state: ${String(status.state)}`);
}

function normalizeUpdaterSchemaVersion(value: unknown): typeof STANDALONE_UPDATER_SCHEMA_VERSION {
  if (value !== STANDALONE_UPDATER_SCHEMA_VERSION) {
    throw new StandaloneProtocolError(
      `unsupported standalone updater schema version: ${String(value)}`,
    );
  }
  return STANDALONE_UPDATER_SCHEMA_VERSION;
}

function normalizeRequiredNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new StandaloneProtocolError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizeRequiredPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new StandaloneProtocolError(`${label} must be a positive safe integer`);
  }
  return value;
}

function sameUpdaterProvider(
  left: StandaloneUpdaterProviderDescriptor,
  right: StandaloneUpdaterProviderDescriptor,
): boolean {
  return (
    left.owner === right.owner
    && left.providerId === right.providerId
    && left.incarnation === right.incarnation
    && sameStandaloneHandoffEnvelope(left.handoff, right.handoff)
    && (
      left.owner === "standalone"
      || (
        right.owner === "shell"
        && left.attachmentId === right.attachmentId
        && left.hostScope === right.hostScope
      )
    )
  );
}

export function validateStandaloneUpdaterProviderDescriptor(
  value: unknown,
  expected?: StandaloneUpdaterProviderDescriptor,
): StandaloneUpdaterProviderDescriptor {
  const provider = requireRecord(value, "standalone updater provider");
  normalizeUpdaterSchemaVersion(provider.schemaVersion);
  const base = {
    handoff: validateStandaloneHandoffEnvelope(provider.handoff, expected?.handoff),
    incarnation: normalizeToken(provider.incarnation, "standalone updater provider incarnation"),
    providerId: normalizeToken(provider.providerId, "standalone updater provider id"),
    schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
  } as const;
  let normalized: StandaloneUpdaterProviderDescriptor;
  if (provider.owner === "standalone") {
    requireKnownKeys(
      provider,
      ["handoff", "incarnation", "owner", "providerId", "schemaVersion"],
      "standalone-owned updater provider",
    );
    if (Object.hasOwn(provider, "attachmentId") || Object.hasOwn(provider, "hostScope")) {
      throw new StandaloneProtocolError(
        "standalone-owned updater provider must not contain Shell attachment fields",
      );
    }
    normalized = { ...base, owner: "standalone" };
  } else if (provider.owner === "shell") {
    requireKnownKeys(
      provider,
      ["attachmentId", "handoff", "hostScope", "incarnation", "owner", "providerId", "schemaVersion"],
      "standalone Shell updater provider",
    );
    normalized = {
      ...base,
      attachmentId: normalizeToken(
        provider.attachmentId,
        "standalone Shell updater attachmentId",
      ),
      hostScope: normalizeToken(provider.hostScope, "standalone Shell updater hostScope"),
      owner: "shell",
    };
  } else {
    throw new StandaloneProtocolError(
      `unsupported standalone updater provider owner: ${String(provider.owner)}`,
    );
  }
  if (expected != null && !sameUpdaterProvider(normalized, expected)) {
    throw new StandaloneProtocolError(
      "standalone updater provider does not match the expected provider incarnation",
    );
  }
  return normalized;
}

export function validateStandaloneUpdaterSnapshot(
  value: unknown,
  expected?: { provider?: StandaloneUpdaterProviderDescriptor },
): StandaloneUpdaterSnapshot {
  const snapshot = requireRecord(value, "standalone updater snapshot");
  requireKnownKeys(
    snapshot,
    ["actions", "presentation", "progress", "provider", "revision", "schemaVersion", "state"],
    "standalone updater snapshot",
  );
  normalizeUpdaterSchemaVersion(snapshot.schemaVersion);
  const provider = validateStandaloneUpdaterProviderDescriptor(snapshot.provider, expected?.provider);
  const states: readonly StandaloneUpdaterState[] = [
    "idle",
    "checking",
    "available",
    "downloading",
    "ready",
    "applying",
    "handed-off",
    "failed",
  ];
  if (!states.includes(snapshot.state as StandaloneUpdaterState)) {
    throw new StandaloneProtocolError(
      `unsupported standalone updater state: ${String(snapshot.state)}`,
    );
  }
  if (!Array.isArray(snapshot.actions)) {
    throw new StandaloneProtocolError("standalone updater snapshot actions must be an array");
  }
  const actions = snapshot.actions.map((rawAction) => {
    const action = requireRecord(rawAction, "standalone updater action presentation");
    requireKnownKeys(
      action,
      ["detail", "emphasis", "id", "label"],
      "standalone updater action presentation",
    );
    if (action.emphasis !== "primary" && action.emphasis !== "secondary" && action.emphasis !== "danger") {
      throw new StandaloneProtocolError("standalone updater action emphasis is unsupported");
    }
    return {
      ...(action.detail == null
        ? {}
        : { detail: requiredString(action.detail, "standalone updater action detail") }),
      emphasis: action.emphasis,
      id: normalizeToken(action.id, "standalone updater action id"),
      label: requiredString(action.label, "standalone updater action label"),
    } as const;
  });
  if (new Set(actions.map((action) => action.id)).size !== actions.length) {
    throw new StandaloneProtocolError("standalone updater action ids must be unique");
  }
  const presentation = requireRecord(snapshot.presentation, "standalone updater presentation");
  requireKnownKeys(presentation, ["detail", "title"], "standalone updater presentation");
  const normalizedPresentation = {
    ...(presentation.detail == null
      ? {}
      : { detail: requiredString(presentation.detail, "standalone updater presentation detail") }),
    title: requiredString(presentation.title, "standalone updater presentation title"),
  };
  let progress: { completed: number; total: number } | undefined;
  if (snapshot.progress != null) {
    const rawProgress = requireRecord(snapshot.progress, "standalone updater progress");
    requireKnownKeys(rawProgress, ["completed", "total"], "standalone updater progress");
    const completed = normalizeRequiredNonNegativeInteger(
      rawProgress.completed,
      "standalone updater progress completed",
    );
    const total = normalizeRequiredPositiveInteger(
      rawProgress.total,
      "standalone updater progress total",
    );
    if (completed > total) {
      throw new StandaloneProtocolError("standalone updater progress completed must not exceed total");
    }
    progress = { completed, total };
  }
  if (snapshot.state === "handed-off" && (actions.length > 0 || progress != null)) {
    throw new StandaloneProtocolError(
      "standalone updater handed-off state is terminal and must not expose actions or progress",
    );
  }
  return {
    actions,
    presentation: normalizedPresentation,
    ...(progress == null ? {} : { progress }),
    provider,
    revision: normalizeRequiredNonNegativeInteger(
      snapshot.revision,
      "standalone updater revision",
    ),
    schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
    state: snapshot.state as StandaloneUpdaterState,
  };
}

export function validateStandaloneUpdaterWaitRequest(
  value: unknown,
  expected?: { provider?: StandaloneUpdaterProviderDescriptor },
): StandaloneUpdaterWaitRequest {
  const request = requireRecord(value, "standalone updater wait request");
  requireKnownKeys(
    request,
    ["afterRevision", "provider", "schemaVersion", "timeoutMs"],
    "standalone updater wait request",
  );
  normalizeUpdaterSchemaVersion(request.schemaVersion);
  const timeoutMs = normalizeRequiredPositiveInteger(
    request.timeoutMs,
    "standalone updater wait timeoutMs",
  );
  if (timeoutMs > 30_000) {
    throw new StandaloneProtocolError("standalone updater wait timeoutMs must not exceed 30000");
  }
  return {
    afterRevision: normalizeRequiredNonNegativeInteger(
      request.afterRevision,
      "standalone updater wait afterRevision",
    ),
    provider: validateStandaloneUpdaterProviderDescriptor(request.provider, expected?.provider),
    schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
    timeoutMs,
  };
}

export function validateStandaloneUpdaterActionRequest(
  value: unknown,
  expected?: { provider?: StandaloneUpdaterProviderDescriptor },
): StandaloneUpdaterActionRequest {
  const request = requireRecord(value, "standalone updater action request");
  requireKnownKeys(
    request,
    ["actionId", "provider", "requestId", "schemaVersion"],
    "standalone updater action request",
  );
  normalizeUpdaterSchemaVersion(request.schemaVersion);
  return {
    actionId: normalizeToken(request.actionId, "standalone updater action id"),
    provider: validateStandaloneUpdaterProviderDescriptor(request.provider, expected?.provider),
    requestId: normalizeToken(request.requestId, "standalone updater action requestId"),
    schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
  };
}

export function validateStandaloneUpdaterActionResult(
  value: unknown,
  expected?: {
    actionId?: string;
    provider?: StandaloneUpdaterProviderDescriptor;
    requestId?: string;
  },
): StandaloneUpdaterActionResult {
  const result = requireRecord(value, "standalone updater action result");
  normalizeUpdaterSchemaVersion(result.schemaVersion);
  const actionId = normalizeToken(result.actionId, "standalone updater action id");
  if (expected?.actionId != null && actionId !== expected.actionId) {
    throw new StandaloneProtocolError("standalone updater action id does not match");
  }
  const provider = validateStandaloneUpdaterProviderDescriptor(result.provider, expected?.provider);
  const requestId = normalizeToken(result.requestId, "standalone updater action requestId");
  if (expected?.requestId != null && requestId !== expected.requestId) {
    throw new StandaloneProtocolError("standalone updater action requestId does not match");
  }
  const exchange = {
    actionId,
    provider,
    requestId,
    schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
  } as const;
  if (result.outcome === "accepted") {
    requireKnownKeys(
      result,
      ["actionId", "operationId", "outcome", "provider", "requestId", "schemaVersion"],
      "standalone updater accepted action result",
    );
    return {
      ...exchange,
      operationId: normalizeToken(result.operationId, "standalone updater operationId"),
      outcome: "accepted",
    };
  }
  if (result.outcome === "unsupported") {
    requireKnownKeys(
      result,
      ["actionId", "outcome", "provider", "requestId", "schemaVersion"],
      "standalone updater unsupported action result",
    );
    return { ...exchange, outcome: "unsupported" };
  }
  if (result.outcome === "failed") {
    requireKnownKeys(
      result,
      ["actionId", "error", "outcome", "provider", "requestId", "schemaVersion"],
      "standalone updater failed action result",
    );
    const error = requireRecord(result.error, "standalone updater action error");
    return {
      ...exchange,
      error: { code: normalizeToken(error.code, "standalone updater action error code") },
      outcome: "failed",
    };
  }
  throw new StandaloneProtocolError(
    `unsupported standalone updater action outcome: ${String(result.outcome)}`,
  );
}

type ComparableVersion = Readonly<{
  core: readonly [number, number, number];
  prerelease: string[];
}>;

function comparableVersion(value: string): ComparableVersion {
  const validated = normalizeVersion(value, "standalone version");
  const normalized = validated.replace(/^v/iu, "").split("+", 1)[0] ?? "";
  const prereleaseSeparator = normalized.indexOf("-");
  const core = prereleaseSeparator === -1 ? normalized : normalized.slice(0, prereleaseSeparator);
  const prerelease = prereleaseSeparator === -1 ? "" : normalized.slice(prereleaseSeparator + 1);
  const parts = core.split(".").map(Number);
  return {
    core: [parts[0]!, parts[1]!, parts[2]!],
    prerelease: prerelease.length === 0 ? [] : prerelease.split("."),
  };
}

function compareIdentifier(left: string, right: string): number {
  const leftNumber = /^\d+$/u.test(left) ? Number(left) : null;
  const rightNumber = /^\d+$/u.test(right) ? Number(right) : null;
  if (leftNumber != null && rightNumber != null) return Math.sign(leftNumber - rightNumber);
  if (leftNumber != null) return -1;
  if (rightNumber != null) return 1;
  return left.localeCompare(right);
}

export function compareStandaloneVersions(left: string, right: string): number {
  const a = comparableVersion(left);
  const b = comparableVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const comparison = Math.sign((a.core[index] ?? 0) - (b.core[index] ?? 0));
    if (comparison !== 0) return comparison;
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  const count = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < count; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart == null) return -1;
    if (rightPart == null) return 1;
    const comparison = compareIdentifier(leftPart, rightPart);
    if (comparison !== 0) return comparison;
  }
  return 0;
}
